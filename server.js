// ============================================================
// INCAN GOLD — Server (Node.js + Socket.IO)
// Deploy on Render (web service) or IONOS (Node hosting)
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const {
  createGame, addPlayer, removePlayer,
  startRound, drawCard, playerLeaves,
  checkRoundEnd, endRound, getPublicState,
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// ── Static files ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory rooms ──────────────────────────────────────
// rooms: { [roomCode]: game }
// playerRoom: { [socketId]: roomCode }
const rooms = {};
const playerRoom = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

function broadcastRoom(roomCode) {
  const game = rooms[roomCode];
  if (!game) return;
  io.to(roomCode).emit('game-state', getPublicState(game));
}

function broadcastLobby(roomCode) {
  const game = rooms[roomCode];
  if (!game) return;
  io.to(roomCode).emit('lobby-update', {
    roomCode,
    hostId: game.hostId,
    players: Object.values(game.players).map(p => ({ id: p.id, name: p.name })),
  });
}

// ── Decision timer (host draws after 3s if all decided) ──
const DECISION_TIMEOUT_MS = 30000; // 30s max before auto-continue

// ── Socket handlers ───────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── CREATE ROOM ──────────────────────────────────────
  socket.on('create-room', ({ playerName }) => {
    const name = String(playerName).trim().slice(0, 20) || 'Aventurier';
    const roomCode = generateRoomCode();
    const game = createGame(roomCode, socket.id);
    addPlayer(game, socket.id, name);
    rooms[roomCode] = game;
    playerRoom[socket.id] = roomCode;

    socket.join(roomCode);
    socket.emit('room-created', { roomCode, playerId: socket.id });
    broadcastLobby(roomCode);
    console.log(`[R] Room ${roomCode} created by ${name}`);
  });

  // ── JOIN ROOM ────────────────────────────────────────
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = String(roomCode).toUpperCase().trim();
    const name = String(playerName).trim().slice(0, 20) || 'Aventurier';
    const game = rooms[code];

    if (!game) {
      socket.emit('error', { message: 'Room introuvable. Vérifie le code.' });
      return;
    }
    if (game.state !== 'lobby') {
      socket.emit('error', { message: 'La partie a déjà commencé.' });
      return;
    }
    if (Object.keys(game.players).length >= 8) {
      socket.emit('error', { message: 'Room pleine (8 joueurs max).' });
      return;
    }

    addPlayer(game, socket.id, name);
    playerRoom[socket.id] = code;
    socket.join(code);
    socket.emit('room-joined', { roomCode: code, playerId: socket.id });
    broadcastLobby(code);
    console.log(`[J] ${name} joined ${code}`);
  });

  // ── START GAME (host only) ────────────────────────────
  socket.on('start-game', () => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.hostId !== socket.id) return;
    if (Object.keys(game.players).length < 2) {
      socket.emit('error', { message: 'Il faut au moins 2 joueurs pour commencer.' });
      return;
    }

    startRound(game);
    io.to(roomCode).emit('game-started', { round: game.round });
    broadcastRoom(roomCode);
    console.log(`[S] Game started in ${roomCode}`);
  });

  // ── DRAW CARD (host only, after all ready or timer) ───
  socket.on('draw-card', () => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.hostId !== socket.id || game.state !== 'playing') return;

    const inTunnel = Object.values(game.players).filter(p => p.inTunnel);
    if (inTunnel.length === 0) {
      endRound(game);
      broadcastRoom(roomCode);
      return;
    }

    const result = drawCard(game);

    if (result.event === 'doubled-hazard') {
      // Force everyone out
      for (const p of Object.values(game.players)) {
        p.inTunnel = false;
        p.gems = 0;
      }
      io.to(roomCode).emit('card-drawn', result);
      broadcastRoom(roomCode);
      setTimeout(() => {
        endRound(game);
        io.to(roomCode).emit('round-ended', {
          round: game.round,
          reason: 'doubled-hazard',
          scoreboard: getPublicState(game).scoreboard,
        });
        broadcastRoom(roomCode);
      }, 2000);
      return;
    }

    if (result.event === 'deck-empty') {
      endRound(game);
      io.to(roomCode).emit('round-ended', {
        round: game.round,
        reason: 'deck-empty',
        scoreboard: getPublicState(game).scoreboard,
      });
      broadcastRoom(roomCode);
      return;
    }

    io.to(roomCode).emit('card-drawn', result);
    broadcastRoom(roomCode);

    // Reset pending decisions
    game.pendingDecisions = {};
  });

  // ── PLAYER DECISION ───────────────────────────────────
  socket.on('player-decision', ({ decision }) => {
    // decision: 'continue' | 'leave'
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.state !== 'playing') return;
    const player = game.players[socket.id];
    if (!player || !player.inTunnel) return;

    game.pendingDecisions[socket.id] = decision;

    if (decision === 'leave') {
      const result = playerLeaves(game, socket.id);
      io.to(roomCode).emit('player-left-tunnel', {
        playerId: socket.id,
        playerName: player.name,
        artifactBonus: result?.artifactBonus || 0,
        chest: player.chest,
      });
    }

    broadcastRoom(roomCode);

    // Check if round ends (all left)
    if (checkRoundEnd(game)) {
      endRound(game);
      const isGameOver = game.state === 'gameOver';
      io.to(roomCode).emit('round-ended', {
        round: game.round,
        reason: 'all-left',
        scoreboard: getPublicState(game).scoreboard,
        gameOver: isGameOver,
      });
      broadcastRoom(roomCode);
    }
  });

  // ── NEXT ROUND ────────────────────────────────────────
  socket.on('next-round', () => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.hostId !== socket.id) return;
    if (game.state !== 'roundEnd') return;

    startRound(game);
    io.to(roomCode).emit('round-started', { round: game.round });
    broadcastRoom(roomCode);
  });

  // ── QUIT ROOM ─────────────────────────────────────────
  socket.on('quit-room', () => {
    handleDisconnect(socket);
  });

  // ── DISCONNECT ────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    handleDisconnect(socket);
  });

  // ── CHAT ──────────────────────────────────────────────
  socket.on('chat-message', ({ message }) => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game) return;
    const player = game.players[socket.id];
    if (!player) return;
    const text = String(message).trim().slice(0, 100);
    if (!text) return;
    io.to(roomCode).emit('chat-message', {
      playerId: socket.id,
      playerName: player.name,
      message: text,
    });
  });
});

function handleDisconnect(socket) {
  const roomCode = playerRoom[socket.id];
  if (!roomCode) return;
  const game = rooms[roomCode];
  if (!game) return;

  const player = game.players[socket.id];
  const wasHost = game.hostId === socket.id;

  removePlayer(game, socket.id);
  delete playerRoom[socket.id];

  if (Object.keys(game.players).length === 0) {
    delete rooms[roomCode];
    console.log(`[X] Room ${roomCode} deleted (empty)`);
    return;
  }

  // Transfer host if needed
  if (wasHost) {
    const newHostId = Object.keys(game.players)[0];
    game.hostId = newHostId;
    io.to(roomCode).emit('host-changed', { newHostId });
  }

  if (game.state === 'lobby') {
    broadcastLobby(roomCode);
  } else {
    broadcastRoom(roomCode);
    // If was in tunnel, check round end
    if (game.state === 'playing' && checkRoundEnd(game)) {
      endRound(game);
      io.to(roomCode).emit('round-ended', {
        round: game.round,
        reason: 'all-left',
        scoreboard: getPublicState(game).scoreboard,
        gameOver: game.state === 'gameOver',
      });
      broadcastRoom(roomCode);
    }
  }

  if (player) {
    io.to(roomCode).emit('player-disconnected', { playerName: player.name });
  }
}

// ── Start server ──────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🏺 Incan Gold server running on port ${PORT}`);
});
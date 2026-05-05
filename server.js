// ============================================================
// INCAN GOLD — Server (Node.js + Socket.IO)
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
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const playerRoom = {};

const AUTO_DRAW_DELAY_MS = 1800; // ms between decisions resolving and next card flip

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

// ── Auto-advance: draw next card when all tunnel players decided ──
function checkAndAutoAdvance(roomCode) {
  const game = rooms[roomCode];
  if (!game || game.state !== 'playing') return;

  const inTunnel = Object.values(game.players).filter(p => p.inTunnel);

  if (inTunnel.length === 0) {
    endRound(game);
    const isGameOver = game.state === 'gameOver';
    io.to(roomCode).emit('round-ended', {
      round: game.round,
      reason: 'all-left',
      scoreboard: getPublicState(game).scoreboard,
      gameOver: isGameOver,
    });
    broadcastRoom(roomCode);
    return;
  }

  const allContinue = inTunnel.every(p => game.pendingDecisions[p.id] === 'continue');
  if (!allContinue) return;

  // Notify clients that all decided → countdown begins
  io.to(roomCode).emit('all-decided', { delayMs: AUTO_DRAW_DELAY_MS });

  if (game._autoDrawTimer) clearTimeout(game._autoDrawTimer);
  game._autoDrawTimer = setTimeout(() => performDraw(roomCode), AUTO_DRAW_DELAY_MS);
}

function performDraw(roomCode) {
  const game = rooms[roomCode];
  if (!game || game.state !== 'playing') return;

  const inTunnel = Object.values(game.players).filter(p => p.inTunnel);
  if (inTunnel.length === 0) {
    endRound(game);
    broadcastRoom(roomCode);
    return;
  }

  const result = drawCard(game);

  if (result.event === 'doubled-hazard') {
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
    }, 2500);
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
  game.pendingDecisions = {};
}

// ── Socket handlers ───────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

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

  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = String(roomCode).toUpperCase().trim();
    const name = String(playerName).trim().slice(0, 20) || 'Aventurier';
    const game = rooms[code];
    if (!game) { socket.emit('error', { message: 'Room introuvable. Vérifie le code.' }); return; }
    if (game.state !== 'lobby') { socket.emit('error', { message: 'La partie a déjà commencé.' }); return; }
    if (Object.keys(game.players).length >= 8) { socket.emit('error', { message: 'Room pleine (8 joueurs max).' }); return; }

    addPlayer(game, socket.id, name);
    playerRoom[socket.id] = code;
    socket.join(code);
    socket.emit('room-joined', { roomCode: code, playerId: socket.id });
    broadcastLobby(code);
    console.log(`[J] ${name} joined ${code}`);
  });

  socket.on('start-game', () => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.hostId !== socket.id) return;
    if (Object.keys(game.players).length < 2) {
      socket.emit('error', { message: 'Il faut au moins 2 joueurs pour commencer.' });
      return;
    }
    startRound(game);
    game.pendingDecisions = {};
    io.to(roomCode).emit('game-started', { round: game.round });
    broadcastRoom(roomCode);
    // Draw first card automatically
    if (game._autoDrawTimer) clearTimeout(game._autoDrawTimer);
    game._autoDrawTimer = setTimeout(() => performDraw(roomCode), 1500);
    console.log(`[S] Game started in ${roomCode}`);
  });

  socket.on('player-decision', ({ decision }) => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.state !== 'playing') return;
    const player = game.players[socket.id];
    if (!player || !player.inTunnel) return;
    if (game.pendingDecisions[socket.id]) return; // already decided

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
    checkAndAutoAdvance(roomCode);
  });

  socket.on('next-round', () => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game || game.hostId !== socket.id || game.state !== 'roundEnd') return;
    startRound(game);
    game.pendingDecisions = {};
    io.to(roomCode).emit('round-started', { round: game.round });
    broadcastRoom(roomCode);
    if (game._autoDrawTimer) clearTimeout(game._autoDrawTimer);
    game._autoDrawTimer = setTimeout(() => performDraw(roomCode), 1500);
  });

  socket.on('quit-room', () => handleDisconnect(socket));
  socket.on('disconnect', () => { console.log(`[-] Disconnected: ${socket.id}`); handleDisconnect(socket); });

  socket.on('chat-message', ({ message }) => {
    const roomCode = playerRoom[socket.id];
    const game = rooms[roomCode];
    if (!game) return;
    const player = game.players[socket.id];
    if (!player) return;
    const text = String(message).trim().slice(0, 100);
    if (!text) return;
    io.to(roomCode).emit('chat-message', { playerId: socket.id, playerName: player.name, message: text });
  });
});

function handleDisconnect(socket) {
  const roomCode = playerRoom[socket.id];
  if (!roomCode) return;
  const game = rooms[roomCode];
  if (!game) return;

  const player = game.players[socket.id];
  const wasHost = game.hostId === socket.id;
  const wasInTunnel = player?.inTunnel;

  // Treat disconnected player in tunnel as 'continue' so the round doesn't stall
  if (wasInTunnel && !game.pendingDecisions[socket.id]) {
    game.pendingDecisions[socket.id] = 'continue';
  }

  removePlayer(game, socket.id);
  delete playerRoom[socket.id];

  if (Object.keys(game.players).length === 0) {
    if (game._autoDrawTimer) clearTimeout(game._autoDrawTimer);
    delete rooms[roomCode];
    console.log(`[X] Room ${roomCode} deleted (empty)`);
    return;
  }

  if (wasHost) {
    const newHostId = Object.keys(game.players)[0];
    game.hostId = newHostId;
    io.to(roomCode).emit('host-changed', { newHostId });
  }

  if (game.state === 'lobby') {
    broadcastLobby(roomCode);
  } else {
    broadcastRoom(roomCode);
    if (game.state === 'playing') checkAndAutoAdvance(roomCode);
  }

  if (player) io.to(roomCode).emit('player-disconnected', { playerName: player.name });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🏺 Incan Gold server running on port ${PORT}`));

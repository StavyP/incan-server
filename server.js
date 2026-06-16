// ─────────────────────────────────────────────
// WAVELENGTH — server.js
// À intégrer dans ton server.js principal Skyjo
// en ajoutant ces événements socket + cette section rooms
// ─────────────────────────────────────────────
// NOTE : Ce fichier est autonome mais conçu pour être fusionné.
// Les rooms Wavelength sont stockées dans wlRooms séparément.
// ─────────────────────────────────────────────

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.get('/', (_req, res) => res.send('Wavelength Server OK'));

// ─────────────────────────────────────────────
// CARTES SPECTRE (84 paires de concepts)
// ─────────────────────────────────────────────
const SPECTRUM_CARDS = [
  { left: 'Chaud', right: 'Froid' },
  { left: 'Célèbre', right: 'Inconnu' },
  { left: 'Dangereux', right: 'Sûr' },
  { left: 'Rapide', right: 'Lent' },
  { left: 'Cher', right: 'Pas cher' },
  { left: 'Fort', right: 'Faible' },
  { left: 'Ancien', right: 'Moderne' },
  { left: 'Grand', right: 'Petit' },
  { left: 'Heureux', right: 'Triste' },
  { left: 'Intelligent', right: 'Stupide' },
  { left: 'Propre', right: 'Sale' },
  { left: 'Bruyant', right: 'Silencieux' },
  { left: 'Complexe', right: 'Simple' },
  { left: 'Réel', right: 'Fictif' },
  { left: 'Utile', right: 'Inutile' },
  { left: 'Beau', right: 'Laid' },
  { left: 'Overrated', right: 'Underrated' },
  { left: 'Naturel', right: 'Artificiel' },
  { left: 'Romantique', right: 'Anti-romantique' },
  { left: 'Sérieux', right: 'Drôle' },
  { left: 'Prévisible', right: 'Surprenant' },
  { left: 'Courageux', right: 'Lâche' },
  { left: 'Populaire', right: 'Impopulaire' },
  { left: 'Léger', right: 'Lourd' },
  { left: 'Doux', right: 'Dur' },
  { left: 'Rapide à apprendre', right: 'Difficile à maîtriser' },
  { left: 'Bon pour la santé', right: 'Mauvais pour la santé' },
  { left: 'Divertissant', right: 'Ennuyeux' },
  { left: 'Courant', right: 'Rare' },
  { left: 'Masculin', right: 'Féminin' },
  { left: 'Citadin', right: 'Campagnard' },
  { left: 'Introverti', right: 'Extraverti' },
  { left: 'Luxueux', right: 'Ordinaire' },
  { left: 'Éphémère', right: 'Durable' },
  { left: 'Logique', right: 'Émotionnel' },
  { left: 'Fantaisie', right: 'Science-fiction' },
  { left: 'Classique', right: 'Avant-gardiste' },
  { left: 'Amer', right: 'Sucré' },
  { left: 'Adulte', right: 'Enfantin' },
  { left: 'Élitiste', right: 'Accessible' },
  { left: 'Chaotique', right: 'Organisé' },
  { left: 'Optimiste', right: 'Pessimiste' },
  { left: 'Inspirant', right: 'Déprimant' },
  { left: 'Coopératif', right: 'Compétitif' },
  { left: 'Nostalgique', right: 'Futuriste' },
  { left: 'Profond', right: 'Superficiel' },
  { left: 'Risqué', right: 'Prudent' },
  { left: 'Génie', right: 'Raté' },
  { left: 'Indispensable', right: 'Dispensable' },
  { left: 'Drôle involontaire', right: 'Drôle volontaire' },
  { left: 'Bon film', right: 'Mauvais film' },
  { left: 'Facile à expliquer', right: 'Difficile à expliquer' },
  { left: 'Acceptable', right: 'Choquant' },
  { left: 'Sain', right: 'Décadent' },
  { left: 'Fragile', right: 'Robuste' },
  { left: 'Actif', right: 'Passif' },
  { left: 'Visible', right: 'Invisible' },
  { left: 'Crédible', right: 'Incroyable' },
  { left: 'Consensuel', right: 'Controversé' },
  { left: 'Efficace', right: 'Inefficace' },
  { left: 'Pressé', right: 'Détendu' },
  { left: 'Tendance', right: 'Dépassé' },
  { left: 'Bien vu', right: 'Mal vu' },
  { left: 'Court', right: 'Long' },
  { left: 'Abondant', right: 'Rare' },
  { left: 'Cliché', right: 'Original' },
  { left: 'Agréable', right: 'Pénible' },
  { left: 'Essentiel', right: 'Anecdotique' },
  { left: 'Audacieux', right: 'Timide' },
  { left: 'Intuitif', right: 'Contre-intuitif' },
  { left: 'Très bon repas', right: 'Repas banal' },
  { left: 'Bon cadeau', right: 'Mauvais cadeau' },
  { left: 'Héros', right: 'Méchant' },
  { left: 'Innovation', right: 'Tradition' },
  { left: 'Début', right: 'Fin' },
  { left: 'Jour', right: 'Nuit' },
  { left: 'Concret', right: 'Abstrait' },
  { left: 'Prévu', right: 'Improvisé' },
  { left: 'Riche', right: 'Pauvre' },
  { left: 'Brut', right: 'Raffiné' },
  { left: 'Universel', right: 'Niche' },
  { left: 'Littéral', right: 'Métaphorique' },
  { left: 'Pro', right: 'Amateur' },
];

// ─────────────────────────────────────────────
// ROOMS
// ─────────────────────────────────────────────
const wlRooms = {};

function makeCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────
// GAME LOGIC
// ─────────────────────────────────────────────

/**
 * Mode normal (4+ joueurs) : 2 équipes
 * Mode 3 joueurs : FFA — chacun joue pour soi
 * Mode 2 joueurs : coopératif
 */
function detectMode(playerCount) {
  if (playerCount === 2) return 'coop';
  if (playerCount === 3) return 'ffa';
  return 'teams';
}

function buildTeams(players) {
  // Répartit les joueurs en 2 équipes équilibrées
  const shuffled = shuffle([...players]);
  const teams = [[], []];
  shuffled.forEach((p, i) => teams[i % 2].push(p.id));
  return teams; // [ [id, id, ...], [id, id, ...] ]
}

function drawCards(n = 3) {
  const pool = shuffle([...SPECTRUM_CARDS]);
  return pool.slice(0, n);
}

function buildGame(players) {
  const mode = detectMode(players.length);
  const orderedPlayers = shuffle([...players]).map((p, idx) => ({
    id:    p.id,
    name:  p.name,
    idx,
    score: p.score || 0,
    team:  null, // assigné après
  }));

  let teams = null;
  if (mode === 'teams') {
    // Équipe 0 = joueurs pairs, équipe 1 = joueurs impairs
    orderedPlayers.forEach((p, i) => { p.team = i % 2; });
    teams = [
      orderedPlayers.filter(p => p.team === 0).map(p => p.id),
      orderedPlayers.filter(p => p.team === 1).map(p => p.id),
    ];
  } else if (mode === 'ffa') {
    orderedPlayers.forEach((p, i) => { p.team = i; }); // chacun sa "team"
  } else {
    // coop
    orderedPlayers.forEach(p => { p.team = 0; });
  }

  const coopDeck = mode === 'coop' ? shuffle([...SPECTRUM_CARDS]).slice(0, 7) : null;

  return {
    mode,
    players: orderedPlayers,
    teams,
    psychicIdx:   0,         // index dans orderedPlayers
    phase:        'choose_card', // choose_card → clue → guess → left_right → reveal
    cardOptions:  drawCards(3), // 3 cartes proposées au Psychic
    chosenCard:   null,
    clue:         null,
    target:       Math.floor(Math.random() * 101), // 0-100
    dialPosition: 50,        // position actuelle du curseur (partagée)
    leftRightGuess: null,    // 'left' | 'right' | null (équipe adverse)
    teamScores:   mode === 'teams' ? [1, 0] : null, // droite commence à 1 pt
    playerScores: mode !== 'teams' ? Object.fromEntries(orderedPlayers.map(p => [p.id, 0])) : null,
    round:        1,
    // Coop
    coopDeck,
    coopScore:    0,
    gameOver:     false,
    winner:       null,
    // Catch-up rule (mode teams)
    catchUp:      false,
    lastRoundScores: null,
  };
}

// Qui est l'équipe adverse du psychic ?
function otherTeam(g) {
  if (g.mode !== 'teams') return null;
  const pTeam = g.players[g.psychicIdx].team;
  return pTeam === 0 ? 1 : 0;
}

// Score basé sur distance à la cible (0-100)
function calcScore(target, dial) {
  const dist = Math.abs(target - dial);
  if (dist <= 5)  return 4;
  if (dist <= 12) return 3;
  if (dist <= 20) return 2;
  return 0;
}

function nextPsychic(g) {
  g.psychicIdx = (g.psychicIdx + 1) % g.players.length;
  g.round++;
  g.phase        = 'choose_card';
  g.cardOptions  = drawCards(3);
  g.chosenCard   = null;
  g.clue         = null;
  g.target       = Math.floor(Math.random() * 101);
  g.dialPosition = 50;
  g.leftRightGuess = null;
  g.lastRoundScores = null;

  // Coop : piocher une carte du deck si bonus
  if (g.mode === 'coop' && g.coopDeck && g.coopDeck.length === 0) {
    g.gameOver = true;
  }
}

function checkGameOver(g) {
  if (g.mode === 'teams') {
    if (g.teamScores[0] >= 10 || g.teamScores[1] >= 10) {
      g.gameOver = true;
      g.winner   = g.teamScores[0] > g.teamScores[1] ? 0 : 1;
    }
  } else if (g.mode === 'ffa') {
    // FFA : fin après N tours complets (chaque joueur a été psychic autant de fois)
    if (g.round > g.players.length * 3) {
      g.gameOver = true;
      const best = Math.max(...Object.values(g.playerScores));
      const winnerId = Object.keys(g.playerScores).find(id => g.playerScores[id] === best);
      g.winner = g.players.find(p => p.id === winnerId)?.name || '?';
    }
  } else if (g.mode === 'coop') {
    if (!g.coopDeck || g.coopDeck.length === 0) {
      g.gameOver = true;
    }
  }
}

// ─────────────────────────────────────────────
// PUBLIC STATE
// ─────────────────────────────────────────────
function publicRoom(room) {
  return {
    code:    room.code,
    host:    room.host,
    started: room.started,
    players: room.players.map(p => ({ id: p.id, name: p.name })),
  };
}

function publicGame(g, forId) {
  const isPsychic = g.players[g.psychicIdx]?.id === forId;
  return {
    mode:          g.mode,
    players:       g.players.map(p => ({
      id:    p.id,
      name:  p.name,
      idx:   p.idx,
      team:  p.team,
      score: g.mode === 'teams'
        ? g.teamScores?.[p.team]
        : g.playerScores?.[p.id] ?? 0,
    })),
    psychicIdx:    g.psychicIdx,
    psychicId:     g.players[g.psychicIdx]?.id,
    phase:         g.phase,
    cardOptions:   isPsychic && g.phase === 'choose_card' ? g.cardOptions : null,
    chosenCard:    g.phase !== 'choose_card' ? g.chosenCard : null,
    clue:          g.phase !== 'choose_card' ? g.clue : null,
    target:        (g.phase === 'reveal' || g.gameOver) ? g.target : (isPsychic ? g.target : null),
    dialPosition:  g.dialPosition,
    leftRightGuess: g.leftRightGuess,
    teamScores:    g.teamScores,
    playerScores:  g.playerScores,
    round:         g.round,
    coopScore:     g.coopScore,
    coopDeckLeft:  g.coopDeck ? g.coopDeck.length : null,
    gameOver:      g.gameOver,
    winner:        g.winner,
    catchUp:       g.catchUp,
    lastRoundScores: g.lastRoundScores,
  };
}

function broadcastGame(room) {
  if (!room?.game || !room?.players) return;
  room.players.forEach(p => {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('wl-game-update', publicGame(room.game, p.id));
  });
}

function getWLRoom(socket) {
  const code = socket.data?.wlRoom;
  return code ? wlRooms[code] : null;
}

// ─────────────────────────────────────────────
// SOCKET EVENTS
// ─────────────────────────────────────────────
io.on('connection', socket => {
  console.log('+ connect', socket.id);

  // ── WAVELENGTH: CREATE ──
  socket.on('wl-create', ({ name }) => {
    try {
      const code = makeCode();
      wlRooms[code] = {
        code,
        host:    socket.id,
        players: [{ id: socket.id, name, score: 0 }],
        game:    null,
        started: false,
      };
      socket.join('wl-' + code);
      socket.data.wlRoom = code;
      socket.emit('wl-room-joined', { code, playerId: socket.id });
      io.to('wl-' + code).emit('wl-room-update', publicRoom(wlRooms[code]));
    } catch (e) { console.error('wl-create error', e.message); }
  });

  // ── WAVELENGTH: JOIN ──
  socket.on('wl-join', ({ name, code }) => {
    try {
      const room = wlRooms[code];
      if (!room)                    return socket.emit('wl-err', 'Salle introuvable.');
      if (room.started)             return socket.emit('wl-err', 'La partie a déjà commencé.');
      if (room.players.length >= 8) return socket.emit('wl-err', 'Salle pleine (8 max).');

      room.players.push({ id: socket.id, name, score: 0 });
      socket.join('wl-' + code);
      socket.data.wlRoom = code;
      socket.emit('wl-room-joined', { code, playerId: socket.id });
      io.to('wl-' + code).emit('wl-room-update', publicRoom(room));
    } catch (e) { console.error('wl-join error', e.message); }
  });

  // ── WAVELENGTH: START ──
  socket.on('wl-start', () => {
    try {
      const code = socket.data?.wlRoom;
      const room = wlRooms[code];
      if (!room || room.host !== socket.id || room.started) return;
      if (room.players.length < 2) return socket.emit('wl-err', 'Il faut au moins 2 joueurs.');

      room.started = true;
      room.game    = buildGame(room.players);
      io.to('wl-' + code).emit('wl-game-start');
      broadcastGame(room);
    } catch (e) { console.error('wl-start error', e.message); }
  });

  // ── WAVELENGTH: ACTION ──
  socket.on('wl-action', ({ type, payload }) => {
    try {
      const room = getWLRoom(socket);
      if (!room?.game) return;
      const g = room.game;
      const me = g.players.find(p => p.id === socket.id);
      if (!me) return;

      const isPsychic = g.players[g.psychicIdx]?.id === socket.id;
      const psychicTeam = g.players[g.psychicIdx]?.team;

      // ── CHOOSE CARD ──
      if (type === 'choose-card' && isPsychic && g.phase === 'choose_card') {
        const idx = payload?.cardIdx;
        if (idx === undefined || !g.cardOptions[idx]) return;
        g.chosenCard = g.cardOptions[idx];
        g.phase = 'clue';

      // ── GIVE CLUE ──
      } else if (type === 'give-clue' && isPsychic && g.phase === 'clue') {
        const clue = (payload?.clue || '').trim();
        if (!clue || clue.length > 80) return;
        g.clue  = clue;
        g.phase = 'guess';

      // ── MOVE DIAL ──
      } else if (type === 'move-dial' && g.phase === 'guess') {
        // En mode FFA ou teams: seuls les non-psychics bougent le curseur
        // En mode coop: tout le monde
        if (g.mode !== 'coop' && isPsychic) return;
        const val = Math.max(0, Math.min(100, Math.round(payload?.value ?? 50)));
        g.dialPosition = val;

      // ── LOCK DIAL ──
      } else if (type === 'lock-dial' && g.phase === 'guess') {
        // L'hôte de l'équipe active (ou n'importe qui en coop) peut verrouiller
        if (g.mode !== 'coop' && isPsychic) return;
        // Passe en left_right (sauf coop/ffa)
        if (g.mode === 'teams') {
          g.phase = 'left_right';
        } else {
          // FFA ou coop : révélation directe
          resolveRound(g);
        }

      // ── LEFT/RIGHT GUESS ──
      } else if (type === 'left-right' && g.phase === 'left_right') {
        // Seule l'équipe adverse vote
        const otherT = otherTeam(g);
        if (me.team === psychicTeam) return; // psychic team ne vote pas
        const dir = payload?.direction;
        if (dir !== 'left' && dir !== 'right') return;
        g.leftRightGuess = dir;
        resolveRound(g);

      // ── NEW ROUND ──
      } else if (type === 'next-round' && g.phase === 'reveal') {
        if (g.gameOver) return;
        nextPsychic(g);
        // Coop: consommer une carte du deck
        if (g.mode === 'coop' && g.coopDeck) {
          g.coopDeck.pop();
          if (g.coopDeck.length === 0) { g.gameOver = true; }
        }

      // ── NEW GAME ──
      } else if (type === 'new-game' && g.gameOver) {
        room.players.forEach(p => { p.score = 0; });
        room.game    = null;
        room.started = false;
        io.to('wl-' + room.code).emit('wl-room-update', publicRoom(room));
        io.to('wl-' + room.code).emit('wl-back-lobby');
        return;
      }

      broadcastGame(room);
    } catch (e) { console.error('wl-action error', e.message, e.stack); }
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    try {
      const code = socket.data?.wlRoom;
      const room = wlRooms[code];
      if (!room) return;
      const name = room.players.find(p => p.id === socket.id)?.name || '?';
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) { delete wlRooms[code]; return; }
      if (room.host === socket.id) room.host = room.players[0].id;
      io.to('wl-' + code).emit('wl-player-left', { name });
      io.to('wl-' + code).emit('wl-room-update', publicRoom(room));
      console.log(`- WL: ${name} left ${code}`);
    } catch (e) { console.error('wl-disconnect error', e.message); }
  });
});

// ─────────────────────────────────────────────
// RESOLVE ROUND
// ─────────────────────────────────────────────
function resolveRound(g) {
  const pts    = calcScore(g.target, g.dialPosition);
  const psychic = g.players[g.psychicIdx];
  const roundInfo = {};

  if (g.mode === 'teams') {
    // Équipe du psychic marque ses points
    g.teamScores[psychic.team] = (g.teamScores[psychic.team] || 0) + pts;
    roundInfo.mainScore = pts;

    // Équipe adverse : +1 si bon left/right ET pas 4 pts
    let lrScore = 0;
    if (pts < 4 && g.leftRightGuess) {
      const correctDir = g.target > g.dialPosition ? 'right' : 'left';
      if (g.leftRightGuess === correctDir) {
        const other = otherTeam(g);
        g.teamScores[other] = (g.teamScores[other] || 0) + 1;
        lrScore = 1;
      }
    }
    roundInfo.lrScore = lrScore;

    // Catch-up rule : si équipe active a marqué 4 et est toujours derrière
    g.catchUp = false;
    if (pts === 4) {
      const t = psychic.team;
      const o = t === 0 ? 1 : 0;
      if (g.teamScores[t] < g.teamScores[o]) {
        g.catchUp = true;
      }
    }

  } else if (g.mode === 'ffa') {
    // Chaque non-psychic qui a "voté" gagne des points basés sur la précision
    // Ici on simplifie : le psychic gagne les pts basés sur la position du dial partagé
    g.playerScores[psychic.id] = (g.playerScores[psychic.id] || 0) + pts;
    roundInfo.mainScore = pts;

  } else if (g.mode === 'coop') {
    g.coopScore = (g.coopScore || 0) + pts;
    roundInfo.mainScore = pts;
    // Bonus : si 4 pts → +1 carte dans le deck
    if (pts === 4 && g.coopDeck) {
      const bonus = drawCards(1);
      g.coopDeck.push(bonus[0]);
    }
  }

  g.lastRoundScores = roundInfo;
  g.phase = 'reveal';
  checkGameOver(g);

  // Catch-up : si rule active, on ne passe pas au suivant automatiquement
  // (le client choisira next-round → le server relancera avec le MÊME psychicIdx)
}

// ─────────────────────────────────────────────
// ANTI-CRASH
// ─────────────────────────────────────────────
process.on('uncaughtException',  (err)    => console.error('uncaughtException:', err.message, err.stack));
process.on('unhandledRejection', (reason) => console.error('unhandledRejection:', reason));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Wavelength server listening on :${PORT}`));

// ============================================================
// INCAN GOLD — Game Logic
// ============================================================

const TREASURES = [
  1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17
];

const HAZARDS = [
  { type: 'fire',    name: 'Flammes',      emoji: '🔥' },
  { type: 'fire',    name: 'Flammes',      emoji: '🔥' },
  { type: 'fire',    name: 'Flammes',      emoji: '🔥' },
  { type: 'spider',  name: 'Araignées',    emoji: '🕷️' },
  { type: 'spider',  name: 'Araignées',    emoji: '🕷️' },
  { type: 'spider',  name: 'Araignées',    emoji: '🕷️' },
  { type: 'snake',   name: 'Serpents',     emoji: '🐍' },
  { type: 'snake',   name: 'Serpents',     emoji: '🐍' },
  { type: 'snake',   name: 'Serpents',     emoji: '🐍' },
  { type: 'rock',    name: 'Éboulement',   emoji: '🪨' },
  { type: 'rock',    name: 'Éboulement',   emoji: '🪨' },
  { type: 'rock',    name: 'Éboulement',   emoji: '🪨' },
  { type: 'mummy',   name: 'Momies',       emoji: '🧟' },
  { type: 'mummy',   name: 'Momies',       emoji: '🧟' },
  { type: 'mummy',   name: 'Momies',       emoji: '🧟' },
];

// Artifact cards (one per expedition round, randomly chosen)
const ARTIFACTS = [
  { type: 'artifact', name: 'Idole en Or',   emoji: '🗿', value: 5 },
  { type: 'artifact', name: 'Masque Inca',   emoji: '🎭', value: 7 },
  { type: 'artifact', name: 'Pierre Sacrée', emoji: '💎', value: 10 },
  { type: 'artifact', name: 'Vase Ancien',   emoji: '🏺', value: 8 },
  { type: 'artifact', name: 'Amulette',      emoji: '🔮', value: 6 },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(round) {
  // Build treasure cards
  const treasures = TREASURES.map((v, i) => ({
    id: `t${i}`,
    type: 'treasure',
    name: `Trésor`,
    emoji: '💰',
    value: v,
  }));

  // Use 3 copies of each hazard type (15 hazards total), pick subset per round
  const hazards = shuffle(HAZARDS).map((h, i) => ({ ...h, id: `h${i}` }));

  // Pick one artifact card per round
  const artifact = { ...ARTIFACTS[(round - 1) % ARTIFACTS.length], id: `a${round}` };

  const deck = shuffle([...treasures, ...hazards, artifact]);
  return deck;
}

function createGame(roomCode, hostId) {
  return {
    roomCode,
    hostId,
    players: {},          // socketId -> { id, name, gems, chest, inTunnel, left }
    state: 'lobby',       // lobby | playing | roundEnd | gameOver
    round: 0,
    maxRounds: 5,
    deck: [],
    path: [],             // cards revealed so far this round
    leftThisRound: [],    // players who left this round with their share
    hazardCounts: {},     // type -> count (for double-hazard detection)
    treasureOnPath: 0,    // leftover gems on path
    artifactOnPath: false,
    pendingDecisions: {}, // socketId -> 'continue' | 'leave'
    decisionTimer: null,
  };
}

function addPlayer(game, socketId, name) {
  game.players[socketId] = {
    id: socketId,
    name,
    gems: 0,
    chest: 0,
    inTunnel: true,
    left: false,
  };
}

function removePlayer(game, socketId) {
  delete game.players[socketId];
}

function startRound(game) {
  game.round += 1;
  game.path = [];
  game.hazardCounts = {};
  game.treasureOnPath = 0;
  game.artifactOnPath = null;
  game.leftThisRound = [];
  game.pendingDecisions = {};
  game.deck = buildDeck(game.round);

  // Reset all players to inTunnel
  for (const p of Object.values(game.players)) {
    p.inTunnel = true;
    p.left = false;
  }

  game.state = 'playing';
}

// Draw one card and resolve it. Returns a result object.
function drawCard(game) {
  if (game.deck.length === 0) {
    return { event: 'deck-empty' };
  }

  const card = game.deck.shift();
  game.path.push(card);

  const inTunnel = Object.values(game.players).filter(p => p.inTunnel);

  if (card.type === 'treasure') {
    const share = Math.floor(card.value / inTunnel.length);
    const leftover = card.value % inTunnel.length;
    game.treasureOnPath += leftover;
    for (const p of inTunnel) {
      p.gems += share;
    }
    card.share = share;
    card.leftover = leftover;
    return { event: 'treasure', card };
  }

  if (card.type === 'artifact') {
    // Artifact stays on path; first player to leave alone gets it
    game.artifactOnPath = card;
    return { event: 'artifact', card };
  }

  // Hazard types: fire, spider, snake, rock, mummy
  const HAZARD_TYPES = ['fire', 'spider', 'snake', 'rock', 'mummy'];
  if (HAZARD_TYPES.includes(card.type)) {
    const prev = game.hazardCounts[card.type] || 0;
    game.hazardCounts[card.type] = prev + 1;

    if (prev + 1 >= 2) {
      // Doubled hazard — everyone still in tunnel loses their round gems
      for (const p of inTunnel) {
        p.gems = 0;
      }
      return { event: 'doubled-hazard', card, eliminated: inTunnel.map(p => p.id) };
    }

    return { event: 'single-hazard', card };
  }

  return { event: 'unknown', card };
}

// Player decides to leave the temple
function playerLeaves(game, socketId) {
  const player = game.players[socketId];
  if (!player || !player.inTunnel) return null;

  player.inTunnel = false;
  player.left = true;

  const leavingNow = Object.values(game.players).filter(p => p.left && !p.inTunnel);
  
  // Check artifact bonus: if exactly one player leaves and artifact is on path
  let artifactBonus = 0;
  if (game.artifactOnPath && leavingNow.length === 1) {
    artifactBonus = game.artifactOnPath.value;
    player.gems += artifactBonus;
    game.artifactOnPath = null;
  }

  // Distribute leftover treasure among those leaving simultaneously
  if (leavingNow.length > 0 && game.treasureOnPath > 0) {
    const share = Math.floor(game.treasureOnPath / leavingNow.length);
    const newLeftover = game.treasureOnPath % leavingNow.length;
    for (const p of leavingNow) {
      p.gems += share;
    }
    game.treasureOnPath = newLeftover;
  }

  // Bank gems
  player.chest += player.gems;
  player.gems = 0;

  game.leftThisRound.push(socketId);

  return { playerId: socketId, artifactBonus };
}

// Check if round should end (all players left or doubled hazard)
function checkRoundEnd(game) {
  const inTunnel = Object.values(game.players).filter(p => p.inTunnel);
  return inTunnel.length === 0;
}

function endRound(game) {
  // Anyone still in tunnel loses gems
  for (const p of Object.values(game.players)) {
    if (p.inTunnel) {
      p.gems = 0;
    }
    p.inTunnel = false;
    p.left = false;
  }

  if (game.round >= game.maxRounds) {
    game.state = 'gameOver';
  } else {
    game.state = 'roundEnd';
  }
}

function getScoreboard(game) {
  return Object.values(game.players)
    .map(p => ({ id: p.id, name: p.name, chest: p.chest, gems: p.gems }))
    .sort((a, b) => b.chest - a.chest);
}

function getPublicState(game) {
  return {
    roomCode: game.roomCode,
    state: game.state,
    round: game.round,
    maxRounds: game.maxRounds,
    path: game.path,
    hazardCounts: game.hazardCounts,
    treasureOnPath: game.treasureOnPath,
    artifactOnPath: game.artifactOnPath,
    players: Object.values(game.players).map(p => ({
      id: p.id,
      name: p.name,
      gems: p.gems,
      chest: p.chest,
      inTunnel: p.inTunnel,
    })),
    scoreboard: getScoreboard(game),
  };
}

module.exports = {
  createGame,
  addPlayer,
  removePlayer,
  startRound,
  drawCard,
  playerLeaves,
  checkRoundEnd,
  endRound,
  getPublicState,
};

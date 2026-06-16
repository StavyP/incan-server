const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir les fichiers statiques (HTML, CSS, JS) depuis le dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Si un utilisateur tape une route inconnue, on le redirige vers l'accueil
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- BASE DE DONNÉES DES CARTES SPECTRE / WAVELENGTH ---
const CARDS_POOL = [
  { left: "Chaud", right: "Froid" },
  { left: "Bon pour la santé", right: "Mauvais pour la santé" },
  { left: "Inoffensif", right: "Dangereux" },
  { left: "Sous-estimé", right: "Surfait" },
  { left: "Normal", right: "Bizarre" },
  { left: "Pas cher", right: "Cher" },
  { left: "Facile à faire", right: "Difficile à faire" },
  { left: "Éthique", right: "Non éthique" },
  { left: "Art", right: "Pas de l'art" },
  { left: "Stylé", right: "Ringard" },
  { left: "Utile", right: "Inutile" },
  { left: "Propre", right: "Sale" },
  { left: "Moins de 100 calories", right: "Plus de 500 calories" },
  { left: "Doux", right: "Dur" },
  { left: "Légal", right: "Illégal" }
];

// --- GESTION DES SALLES DE JEU (ROOMS) ---
const rooms = {};

// Fonction utilitaire pour générer un code de salon à 4 lettres majuscules
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

// Initialisation d'une nouvelle salle
function createNewRoom(code, hostId) {
  return {
    code:         code,
    hostId:       hostId,
    players:      [], // { id, name, team: 0 ou 1 }
    phase:        'lobby', // 'lobby' au départ
    teamScore:    [0, 0], // Score Équipe A (0) et Équipe B (1)
    currentTeam:  0, // L'équipe qui doit jouer ce tour (0 ou 1)
    psychic:      null, // ID socket du Psy du tour
    clue:         null, // Indice donné
    target:       90, // Position cible (entre 0 et 180)
    dial:         90, // Position de l'aiguille des joueurs (entre 0 et 180)
    lrGuess:      null, // Pari de l'autre équipe ('left' ou 'right')
    cardOptions:  [], // Choix des 2 cartes pour le Psy
    chosenCard:   null, // La carte sélectionnée { left, right }
    gameOver:     false,
    winner:       null
  };
}

// Préparer un nouveau tour de jeu
function startNewRound(g) {
  // Choisir le Psy du tour (le joueur suivant dans l'équipe active)
  const activePlayers = g.players.filter(p => p.team === g.currentTeam);
  if (activePlayers.length === 0) {
    // Si l'équipe active n'a pas de joueurs, on prend le premier disponible globalement
    g.psychic = g.players[0]?.id || null;
  } else {
    // Rotation simple : on cherche l'ancien Psy et on prend le suivant
    const currentPsychicIndex = activePlayers.findIndex(p => p.id === g.psychic);
    const nextIndex = (currentPsychicIndex + 1) % activePlayers.length;
    g.psychic = activePlayers[nextIndex]?.id || null;
  }

  // Générer une cible aléatoire entre 10 et 170 pour éviter les extrêmes impossibles
  g.target = Math.floor(Math.random() * 160) + 10;
  g.dial = 90; // Réinitialisation du cadran au centre
  g.clue = null;
  g.lrGuess = null;

  // Proposer deux cartes aléatoires au Psy
  const shuffled = [...CARDS_POOL].sort(() => 0.5 - Math.random());
  g.cardOptions = [shuffled[0], shuffled[1]];
  g.chosenCard = null;

  // On passe à la phase de choix de carte
  g.phase = 'choose_card';
}

// Filtrer les données de la salle pour ne pas tricher (cacher la cible aux joueurs)
function formatRoomState(g, socketId) {
  if (!g) return null;
  const isPsychic = (g.psychic === socketId);
  
  return {
    code:         g.code,
    hostId:       g.hostId,
    players:      g.players,
    phase:        g.phase,
    teamScore:    g.teamScore,
    currentTeam:  g.currentTeam,
    psychic:      g.psychic,
    clue:         g.clue,
    dial:         g.dial,
    lrGuess:      g.lrGuess,
    gameOver:     g.gameOver,
    winner:       g.winner,
    // Infos cachées selon le rôle :
    cardOptions:  isPsychic && g.phase === 'choose_card' ? g.cardOptions : null,
    chosenCard:   g.phase !== 'choose_card' ? g.chosenCard : null,
    target:       (g.phase === 'reveal' || g.gameOver) ? g.target : (isPsychic ? g.target : null)
  };
}

// Mettre à jour l'état de la salle pour tous les joueurs connectés
function broadcastState(code) {
  const g = rooms[code];
  if (!g) return;
  
  g.players.forEach(p => {
    io.to(p.id).emit('wl-room-update', formatRoomState(g, p.id));
  });
}

// Calculer les points à la fin d'un tour
function calculatePoints(target, dial) {
  const diff = Math.abs(target - dial);
  if (diff <= 2) return 4;
  if (diff <= 7) return 3;
  if (diff <= 15) return 2;
  return 0;
}


// --- GESTION DES ÉVÉNEMENTS SOCKET.IO ---
io.on('connection', (socket) => {

  // ── CRÉER UNE SALLE ──
  socket.on('wl-create', ({ name }) => {
    try {
      const code = generateRoomCode();
      rooms[code] = createNewRoom(code, socket.id);

      const player = { id: socket.id, name: name || 'Créateur', team: 0 };
      rooms[code].players.push(player);

      socket.join(`wl-room-${code}`);

      // ✅ REPARÉ : Envoyer la validation de connexion au client pour changer d'écran
      socket.emit('wl-room-joined', { code, playerId: socket.id });

      // Rafraîchir l'interface de tout le monde
      broadcastState(code);
    } catch (e) { 
      console.error('wl-create error', e.message); 
    }
  });

  // ── REJOINDRE UNE SALLE ──
  socket.on('wl-join', ({ name, code }) => {
    try {
      const rCode = code?.trim().toUpperCase();
      const g = rooms[rCode];
      
      if (!g) {
        socket.emit('wl-err', 'Salle introuvable.');
        return;
      }
      if (g.players.length >= 16) {
        socket.emit('wl-err', 'La salle est pleine (max 16).');
        return;
      }

      // Équilibrage automatique des équipes (0 pour équipe A, 1 pour équipe B)
      const team = g.players.length % 2; 
      const player = { id: socket.id, name: name || 'Joueur', team };
      g.players.push(player);

      socket.join(`wl-room-${rCode}`);

      // ✅ REPARÉ : Envoyer la validation au client pour basculer sur l'écran d'attente
      socket.emit('wl-room-joined', { code: rCode, playerId: socket.id });

      // Rafraîchir l'interface
      broadcastState(rCode);
    } catch (e) { 
      console.error('wl-join error', e.message); 
    }
  });

  // ── CHANGER D'ÉQUIPE MANUELLEMENT ──
  socket.on('wl-change-team', ({ code, team }) => {
    const g = rooms[code];
    if (!g) return;
    const player = g.players.find(p => p.id === socket.id);
    if (player) {
      player.team = team;
      broadcastState(code);
    }
  });

  // ── LANCER LA PARTIE ──
  socket.on('wl-start-game', ({ code }) => {
    const g = rooms[code];
    if (!g || g.hostId !== socket.id) return;

    if (g.players.length < 2) {
      socket.emit('wl-err', 'Il faut au moins 2 joueurs pour lancer la partie.');
      return;
    }

    g.teamScore = [0, 0];
    g.gameOver = false;
    g.winner = null;
    g.currentTeam = 0; // L'équipe A commence

    startNewRound(g);
    broadcastState(code);
  });

  // ── INTERACTIONS DU JEU (PSYCHIC ET JOUEURS) ──
  socket.on('wl-action', ({ code, type, value }) => {
    const g = rooms[code];
    if (!g || g.gameOver) return;

    const player = g.players.find(p => p.id === socket.id);
    if (!player) return;

    const isPsychic = (g.psychic === socket.id);
    const isOurTeam = (player.team === g.currentTeam);

    // 1. Le Psy choisit la carte
    if (type === 'choose-card' && isPsychic && g.phase === 'choose_card') {
      g.chosenCard = value; // value correspond à la carte choisie { left, right }
      g.phase = 'clue';
      broadcastState(code);
    } 
    
    // 2. Le Psy donne son indice textuel
    else if (type === 'give-clue' && isPsychic && g.phase === 'clue') {
      if (!value || value.trim() === "") return;
      g.clue = value.trim();
      g.phase = 'guess';
      broadcastState(code);
    } 
    
    // 3. Les coéquipiers font tourner l'aiguille
    else if (type === 'move-dial' && !isPsychic && isOurTeam && g.phase === 'guess') {
      g.dial = parseInt(value, 10);
      broadcastState(code);
    } 
    
    // 4. Les coéquipiers valident l'aiguille
    else if (type === 'lock-dial' && !isPsychic && isOurTeam && g.phase === 'guess') {
      // On passe au choix Gauche / Droite pour l'équipe adverse
      g.phase = 'left_right';
      broadcastState(code);
    } 
    
    // 5. L'équipe adverse parie si la cible est plus à Gauche ou à Droite que l'aiguille
    else if (type === 'left-right' && !isOurTeam && g.phase === 'left_right') {
      g.lrGuess = value; // 'left' ou 'right'
      
      // Fin du tour : On passe aux révélations et aux comptes des points
      g.phase = 'reveal';

      // Points pour l'équipe active
      const pointsActive = calculatePoints(g.target, g.dial);
      g.teamScore[g.currentTeam] += pointsActive;

      // Points pour l'équipe passive (Pari Gauche / Droite)
      const otherTeam = g.currentTeam === 0 ? 1 : 0;
      if (g.lrGuess === 'left' && g.target < g.dial && pointsActive < 4) {
        g.teamScore[otherTeam] += 1;
      } else if (g.lrGuess === 'right' && g.target > g.dial && pointsActive < 4) {
        g.teamScore[otherTeam] += 1;
      }

      // Condition de victoire (Score >= 10)
      if (g.teamScore[0] >= 10 || g.teamScore[1] >= 10) {
        g.gameOver = true;
        if (g.teamScore[0] === g.teamScore[1]) {
          g.winner = 'draw'; // Égalité temporaire
        } else {
          g.winner = g.teamScore[0] > g.teamScore[1] ? 0 : 1;
        }
      }

      broadcastState(code);
    } 
    
    // 6. Passer au tour suivant
    else if (type === 'next-round' && g.phase === 'reveal') {
      // Changement d'équipe active
      g.currentTeam = g.currentTeam === 0 ? 1 : 0;
      
      startNewRound(g);
      broadcastState(code);
    }
  });

  // ── DÉCONNEXION ──
  socket.on('disconnect', () => {
    // Parcourir toutes les rooms pour trouver et supprimer le joueur déconnecté
    Object.keys(rooms).forEach(code => {
      const g = rooms[code];
      const index = g.players.findIndex(p => p.id === socket.id);
      
      if (index !== -1) {
        g.players.splice(index, 1);
        
        // Si le salon se retrouve vide, on supprime la room de la mémoire
        if (g.players.length === 0) {
          delete rooms[code];
        } else {
          // Si l'hôte est parti, on désigne un nouvel hôte
          if (g.hostId === socket.id) {
            g.hostId = g.players[0].id;
          }
          // Si le Psy est parti au milieu de son tour, on relance un tour propre
          if (g.psychic === socket.id && !g.gameOver && g.phase !== 'lobby') {
            startNewRound(g);
          }
          broadcastState(code);
        }
      }
    });
  });

});

// Lancement du serveur sur le port 3000 (ou variable d'environnement)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Wavelength démarré sur le port ${PORT}`);
});

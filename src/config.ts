// Tous les paramètres réglables du jeu. Unités : mètres, secondes.
// Aucune valeur de gameplay ne doit être écrite en dur ailleurs.

export const config = {
  // --- Boucle de jeu ---
  /** Pas de temps fixe de la simulation (s). */
  fixedDt: 1 / 120,
  /** Durée max d'une frame prise en compte (s) : évite la « spirale de la mort » après un onglet en arrière-plan. */
  maxFrameTime: 0.25,

  // --- Écran / caméra ---
  /** Hauteur de monde visible (m) en portrait : rue + trottoirs. */
  viewHeight: 20,
  /** Largeur de monde minimale visible (m) : si l'écran est trop large, on dézoome pour la garantir. */
  viewMinWidth: 8,
  /** Plafond du devicePixelRatio (performances). */
  maxDpr: 3,

  // --- Rue ---
  /** Largeur de la chaussée (m), traversée selon l'axe vertical. 4 voies informelles. */
  streetWidth: 12,
  /** Profondeur de chaque trottoir (m). */
  sidewalkDepth: 4,
  /** Nombre de voies informelles (marquage au sol uniquement). */
  laneCount: 4,

  // --- Piéton (§4) ---
  /** Vitesse de marche (m/s). */
  walkSpeed: 1.3,
  /** Rayon du piéton (m). */
  pedRadius: 0.3,
  /** Vitesse latérale max (m/s). */
  lateralMaxSpeed: 0.6,
  /** Accélération (m/s²) : walkSpeed atteinte en ~0,25 s. */
  pedAccel: 5.2,
  /** Décélération (m/s²) quand le doigt se lève. */
  pedDecel: 5.2,
  /** Déplacement horizontal du doigt (fraction de la largeur d'écran) donnant lateralMaxSpeed. */
  lateralFullDeflect: 0.2,
  /** Écart horizontal max du piéton par rapport au centre (m). */
  pedMaxX: 4.5,
  /** Position de départ : distance du piéton au bord de la chaussée, sur le trottoir (m). */
  pedStartOffset: 1,
  /** Traversée validée quand le piéton dépasse le bord opposé de cette distance (m). */
  arrivalMargin: 0.6,
  /** Longueur d'un pas (m), pour l'oscillation de marche. */
  stepLength: 0.7,
  /** Amplitude latérale de l'oscillation de marche (m). */
  stepSway: 0.05,
  /** Vitesse de demi-tour visuel (rad/s). */
  turnRate: 9,

  // --- Scooters : mouvement de base (§5.1) ---
  /** Vitesse de croisière tirée au hasard dans [min, max] (m/s). */
  scooterSpeedMin: 6,
  scooterSpeedMax: 9,
  /** Dimensions de la capsule (m). */
  scooterLength: 1.8,
  scooterWidth: 0.7,
  /** Accélération / freinage longitudinal (m/s²). */
  scooterAccel: 3,
  scooterDecel: 8,
  /** Vitesse latérale max (m/s) — partagée avec l'IA d'évitement. */
  steerMax: 2.5,
  /** Accélération latérale (m/s²) : douceur des changements de cap. */
  scooterLatAccel: 5,
  /** Rappel vers la position verticale de confort (1/s). */
  comfortGain: 0.8,
  /** Marge entre les scooters et les bordures (m). */
  streetEdgeMargin: 0.15,
  /** Séparation : portée longitudinale et latérale de la répulsion (m). */
  sepRangeX: 3,
  sepRangeY: 1.4,
  /** Séparation : vitesse latérale de répulsion max (m/s). */
  sepStrength: 2,
  /** Suivi : écart mini pare-chocs à pare-chocs (m) et raideur (1/s). */
  followGap: 0.8,
  followGain: 2.5,
  /** Abscisse d'apparition (m, hors écran à gauche) : laisse à l'IA la place d'anticiper. */
  spawnX: -22,
  /** Abscisse de disparition (m, hors écran à droite). */
  despawnX: 12,
  /** Double sens (test) : le haut de la rue roule de droite à gauche. */
  twoWay: false,
  /** Durée simulée avant le début (s) : la rue est déjà pleine à l'ouverture. */
  trafficPrewarm: 5,
  /** Plafond de sécurité du nombre de scooters. */
  maxScooters: 150,

  // --- Densité (§7) ---
  /** Débit initial (scooters/s). */
  spawnRateStart: 1.2,
  /** Hausse du débit à chaque palier (scooters/s). */
  spawnRateStep: 0.4,
  /** Débit max (scooters/s). */
  spawnRateMax: 5,
  /** Durée d'un palier de densité (s). */
  densityInterval: 20,
  /** Intervalle minimal entre deux apparitions (s). */
  spawnMinInterval: 0.03,
};

export type Config = typeof config;

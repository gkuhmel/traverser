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
  pedStartOffset: 1.2,
  /** Traversée validée quand le piéton dépasse le bord opposé de cette distance (m). */
  arrivalMargin: 1.2,
  /** Longueur d'un pas (m), pour l'oscillation de marche. */
  stepLength: 0.7,
  /** Amplitude latérale de l'oscillation de marche (m). */
  stepSway: 0.05,
  /** Vitesse de demi-tour visuel (rad/s). */
  turnRate: 9,

  // --- Accélération (ajout hors spec, demandé) ---
  /** Multiplicateur de walkSpeed pendant l'accélération. */
  sprintMultiplier: 1.7,
  /** Durée de l'accélération (s). */
  sprintDuration: 1.5,
  /** Temps de recharge après la fin de l'accélération (s). */
  sprintCooldown: 6,
  /** Accélération / décélération du piéton vers et depuis la vitesse d'accélération (m/s²) : plus douce. */
  sprintAccel: 3,
  /** Un piéton qui court se remarque : retard de perception (s) pendant l'accélération et sprintLagTail après. */
  sprintPerceptionLag: 0.15,
  sprintLagTail: 0.8,
  /** … et les conducteurs, attentifs, ne s'engagent que pour cette durée (s) au lieu de commitTime. */
  sprintCommitTime: 0.15,

  // --- Véhicules : mouvement de base (§5.1) ---
  // Les réglages ci-dessous sont ceux du scooter ; chaque type de véhicule les module (voir `vehicles`).
  /** Accélération / freinage longitudinal (m/s²). */
  scooterAccel: 3,
  scooterDecel: 8,
  /** Vitesse latérale max (m/s), §5.4. */
  steerMax: 2.5,
  /** Accélération latérale (m/s²) : douceur des changements de cap. */
  scooterLatAccel: 5,
  /** Rappel vers la position verticale de confort (1/s). */
  comfortGain: 0.8,
  /** Marge entre les scooters et les bordures (m). */
  streetEdgeMargin: 0.3,
  /** Séparation : portée de la répulsion au-delà du contact, en longitudinal et en latéral (m). */
  sepMarginX: 1.2,
  sepMarginY: 0.7,
  /** Séparation : vitesse latérale de répulsion max (m/s). */
  sepStrength: 2,
  /** Écart minimal garanti entre deux véhicules (m) : contrainte dure, jamais de superposition. */
  scooterGapMin: 0.1,
  /** Suivi : écart mini pare-chocs à pare-chocs (m) et raideur (1/s). */
  followGap: 0.8,
  followGain: 2.5,
  /** Dépassement : un véhicule bridé de plus de overtakeDeficit (m/s) pendant overtakeDelay (s)
   *  déboîte du côté libre, à overtakeMargin (m) du véhicule lent. Évite les bouchons. */
  overtakeDeficit: 0.8,
  overtakeDelay: 0.4,
  overtakeMargin: 0.4,
  /** Abscisse d'apparition (m, hors écran à gauche) : laisse à l'IA la place d'anticiper. */
  spawnX: -22,
  /** Abscisse de disparition (m, hors écran à droite). */
  despawnX: 12,
  /**
   * Types de véhicules (ajout hors spec, demandé). Tous jouent le jeu de l'évitement, avec leur gabarit :
   * - weight : part dans le trafic ; length / width / cornerRadius (m) ;
   * - speedMin / speedMax : vitesse de croisière (m/s) ;
   * - steerFactor / latAccelFactor / accelFactor / decelFactor : agilité relative au scooter
   *   (multiplient steerMax, scooterLatAccel, scooterAccel, scooterDecel) ;
   * - brakeMaxFactor : multiplie brakeMax (plafonné à 0,85 : jamais l'arrêt complet) ;
   * - brakeCostFactor : multiplie brakeCost (< 1 : préfère ralentir plutôt que dévier) ;
   * - horizonFactor : multiplie predictionHorizon (les gros véhicules anticipent plus tôt) ;
   * - mass : poids relatif quand deux véhicules se poussent (le plus lourd bouge moins).
   */
  vehicles: {
    scooter: { weight: 0.62, length: 1.8, width: 0.7, cornerRadius: 0.35, speedMin: 6, speedMax: 9, steerFactor: 1, latAccelFactor: 1, accelFactor: 1, decelFactor: 1, brakeMaxFactor: 1, brakeCostFactor: 1, horizonFactor: 1, mass: 1 },
    bike: { weight: 0.16, length: 1.7, width: 0.5, cornerRadius: 0.25, speedMin: 3.5, speedMax: 5, steerFactor: 1, latAccelFactor: 1, accelFactor: 0.5, decelFactor: 1, brakeMaxFactor: 0.7, brakeCostFactor: 1.5, horizonFactor: 2, mass: 0.6 },
    tuktuk: { weight: 0.13, length: 2.6, width: 1.3, cornerRadius: 0.4, speedMin: 4.5, speedMax: 6.5, steerFactor: 0.55, latAccelFactor: 0.5, accelFactor: 0.6, decelFactor: 1, brakeMaxFactor: 1.8, brakeCostFactor: 0.3, horizonFactor: 1.5, mass: 2.5 },
    truck: { weight: 0.09, length: 4.2, width: 1.8, cornerRadius: 0.25, speedMin: 5, speedMax: 7, steerFactor: 0.4, latAccelFactor: 0.35, accelFactor: 0.4, decelFactor: 0.9, brakeMaxFactor: 2.2, brakeCostFactor: 0.2, horizonFactor: 1.8, mass: 6 },
  },
  /** Double sens (test) : le haut de la rue roule de droite à gauche. */
  twoWay: false,
  /** Durée simulée avant le début (s) : la rue est déjà pleine à l'ouverture. */
  trafficPrewarm: 5,
  /** Plafond de sécurité du nombre de scooters. */
  maxScooters: 150,

  // --- IA d'évitement (§5.2–5.4) — les deux réglages principaux : perceptionLag et commitTime ---
  // Distances « d'écart » = espace libre entre le bord du piéton et le bord du scooter (m).
  /** Constante de temps du lissage de la vitesse perçue du piéton (s). */
  perceptionLag: 0.4,
  /** Horizon de prédiction de la position du piéton (s). */
  predictionHorizon: 1.5,
  /** Durée d'engagement sur un côté de contournement (s). */
  commitTime: 0.6,
  /** Écart visé lors du contournement (m). Spec : 1,2 ; abaissé à 0,5 après simulation, car avec un écart
   *  bord à bord de 1,2 m la marge absorbait l'erreur de prédiction et l'hésitation n'était plus punie. */
  safeDistance: 0.5,
  /** Écart réel sous lequel le scooter peut changer d'avis malgré l'engagement (m). */
  panicDistance: 0.6,
  /** Ralentissement max, en fraction de la vitesse de croisière (jamais l'arrêt complet). */
  brakeMax: 0.4,
  /** Distance devant le scooter sous laquelle il réagit au piéton (m). */
  awarenessRange: 15,
  /** Coût d'un freinage à 100 %, exprimé en mètres de déviation équivalents (préférence pour dévier). */
  brakeCost: 4,
  /** Nombre de niveaux de freinage évalués, de 0 à brakeMax. */
  brakeSteps: 3,
  /** Pénalité par mètre d'écart manquant : une option infaisable n'est retenue qu'en dernier recours. */
  shortfallPenalty: 10,
  /** Intervalle entre deux décisions d'un scooter (s). */
  decisionInterval: 0.1,
  /** Écart de déviation (m) sous lequel les deux côtés sont jugés équivalents : on préfère « derrière ». */
  sideTieMargin: 0.3,
  /** Raideur du guidage latéral vers la trajectoire d'évitement (1/s). */
  avoidGain: 4,
  /** Part de la séparation entre scooters conservée pendant un évitement. */
  avoidSepFactor: 0.3,

  // --- Collision, frôlements, fin de partie (§6) ---
  /** Durée de l'arrêt sur image à l'impact (s). */
  hitStopDuration: 0.3,
  /** Amplitude (m) et durée (s) du tremblement d'écran à l'impact. */
  shakeAmplitude: 0.25,
  shakeDuration: 0.3,
  /** Sous cette vitesse (m/s), un véhicule touché ne renverse pas : le piéton est simplement bloqué. */
  lethalSpeed: 1.5,
  /** Frôlement : scooter passé à moins de cet écart (m) sans contact. Spec : 0,8 ; ramené à 0,4, juste sous
   *  safeDistance (0,5), sinon chaque évitement normal compte comme un frôlement (3 à 12 par traversée). */
  nearMissDistance: 0.4,
  /** Durée de l'effet visuel de frôlement (s). */
  nearMissFxDuration: 0.45,
  /** Délai avant que « Toucher pour rejouer » soit actif (s). */
  replayDelay: 0.5,

  // --- Densité (§7) ---
  /** Débit initial (scooters/s). */
  spawnRateStart: 1.2,
  /** Hausse du débit à chaque palier (scooters/s). */
  spawnRateStep: 0.4,
  /** Débit max (scooters/s). */
  spawnRateMax: 5,
  /** Durée d'un palier de densité (s). */
  densityInterval: 20,
  /** Durée du surlignage du niveau de densité à chaque nouveau palier (s). */
  densityFlashDuration: 1.5,
  /** Rafales et creux : probabilité de chaque type de tronçon (le reste = flux normal). */
  burstChance: 0.25,
  lullChance: 0.25,
  /** Multiplicateur du débit pendant une rafale / un creux (moyenne globale ≈ 1). */
  burstMultiplier: 1.8,
  lullMultiplier: 0.3,
  /** Durée d'un tronçon de flux, tirée dans [min, max] (s). */
  flowSegmentMin: 1.5,
  flowSegmentMax: 4,
  /** Intervalle minimal entre deux apparitions (s). */
  spawnMinInterval: 0.03,
};

export type Config = typeof config;

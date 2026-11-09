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
};

export type Config = typeof config;

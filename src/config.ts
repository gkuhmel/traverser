// Tous les paramètres réglables du jeu. Unités : mètres, secondes.
// Aucune valeur de gameplay ne doit être écrite en dur ailleurs.

export const config = {
  // --- Boucle de jeu ---
  /** Pas de temps fixe de la simulation (s). */
  fixedDt: 1 / 120,
  /** Durée max d'une frame prise en compte (s) : évite la « spirale de la mort » après un onglet en arrière-plan. */
  maxFrameTime: 0.25,

  // --- Écran / caméra ---
  /** Hauteur de monde visible (m) en portrait : rue + trottoirs + marge. */
  viewHeight: 20,
  /** Largeur de monde minimale visible (m) : si l'écran est trop large, on dézoome pour la garantir. */
  viewMinWidth: 8,
  /** Plafond du devicePixelRatio (performances). */
  maxDpr: 3,

  // --- Scène de test de l'étape 1 (temporaire) ---
  /** Amplitude (m) et période (s) du marqueur de test qui oscille. */
  testMarkerAmplitude: 3,
  testMarkerPeriod: 2,
};

export type Config = typeof config;

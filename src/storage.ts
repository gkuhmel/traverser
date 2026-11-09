/** Sauvegarde locale du meilleur score. localStorage peut lever (navigation privée, quota) : toujours protégé. */
const BEST_KEY = 'traverser.best';

export function loadBest(): number {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // stockage indisponible : le meilleur score ne survivra pas au rechargement
  }
}

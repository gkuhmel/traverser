/**
 * Gestion du doigt : un seul pointeur actif à la fois (le premier posé).
 * Les coordonnées sont en pixels CSS ; la conversion en mètres se fait côté jeu via la caméra.
 */
export class Input {
  /** Un doigt est-il posé ? */
  down = false;
  /** Position courante du doigt (px CSS). */
  x = 0;
  y = 0;
  /** Position où le doigt a été posé (px CSS). */
  startX = 0;
  startY = 0;

  private pointerId: number | null = null;
  private pendingPresses = 0;
  private pendingReleases = 0;

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    target.addEventListener('lostpointercapture', this.onUp);

    // Si l'app passe en arrière-plan, on considère le doigt levé.
    window.addEventListener('blur', this.forceRelease);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.forceRelease();
    });

    blockSafariGestures();
  }

  /** Renvoie true une fois par appui (front montant), à consommer dans la simulation. */
  consumePress(): boolean {
    if (this.pendingPresses > 0) {
      this.pendingPresses--;
      return true;
    }
    return false;
  }

  /** Renvoie true une fois par relâchement (front descendant). */
  consumeRelease(): boolean {
    if (this.pendingReleases > 0) {
      this.pendingReleases--;
      return true;
    }
    return false;
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.pointerId !== null) return; // un second doigt est ignoré
    this.pointerId = e.pointerId;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // capture indisponible : sans conséquence, on suit quand même les événements
    }
    this.down = true;
    this.x = this.startX = e.clientX;
    this.y = this.startY = e.clientY;
    this.pendingPresses++;
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.x = e.clientX;
    this.y = e.clientY;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };

  private forceRelease = (): void => {
    if (this.pointerId !== null) this.release();
  };

  private release(): void {
    this.pointerId = null;
    this.down = false;
    this.pendingReleases++;
  }
}

/** Bloque les gestes parasites de Safari iOS : pinch-zoom, double-tap zoom, loupe, menu, scroll. */
function blockSafariGestures(): void {
  const prevent = (e: Event): void => e.preventDefault();
  const opts: AddEventListenerOptions = { passive: false };
  // Événements propriétaires WebKit pour le pinch.
  document.addEventListener('gesturestart', prevent, opts);
  document.addEventListener('gesturechange', prevent, opts);
  document.addEventListener('gestureend', prevent, opts);
  // Scroll / rebond élastique et double-tap.
  document.addEventListener('touchmove', prevent, opts);
  document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, opts);
  document.addEventListener('dblclick', prevent, opts);
  document.addEventListener('contextmenu', prevent, opts);
  document.addEventListener('selectstart', prevent, opts);
}

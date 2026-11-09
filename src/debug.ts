import type { Camera } from './camera';
import type { LoopStats } from './loop';

/**
 * Panneau de debug (?debug=1). Chargé dynamiquement : rien n'est exécuté ni téléchargé sans le paramètre.
 * Étape 1 : fps, pas de simulation par frame, taille d'écran, DPR, échelle.
 */
export class DebugPanel {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private accTime = 0;
  private fps = 0;
  private maxSteps = 0;

  constructor(
    private readonly stats: LoopStats,
    private readonly camera: Camera,
    private readonly getDpr: () => number,
  ) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
      left: '6px',
      padding: '4px 6px',
      font: '11px/1.35 ui-monospace, Menlo, monospace',
      color: '#fff',
      background: 'rgba(0,0,0,0.55)',
      borderRadius: '4px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  /** À appeler une fois par frame rendue. */
  frame(): void {
    this.frames++;
    this.accTime += this.stats.frameTime;
    this.maxSteps = Math.max(this.maxSteps, this.stats.stepsLastFrame);
    if (this.accTime < 0.5) return;

    this.fps = this.frames / this.accTime;
    const c = this.camera;
    this.el.textContent =
      `fps ${this.fps.toFixed(0)}  pas/frame max ${this.maxSteps}\n` +
      `écran ${c.width}×${c.height} px  dpr ${this.getDpr()}\n` +
      `vue ${c.viewWidthM.toFixed(1)}×${c.viewHeightM.toFixed(1)} m  ${c.scale.toFixed(1)} px/m`;
    this.frames = 0;
    this.accTime = 0;
    this.maxSteps = 0;
  }
}

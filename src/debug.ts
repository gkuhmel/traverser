import type { Camera } from './camera';
import type { Game } from './game';
import type { LoopStats } from './loop';

/**
 * Panneau de debug (?debug=1). Chargé dynamiquement : rien n'est exécuté ni téléchargé sans le paramètre.
 * Pour l'instant : fps, coût simulation/rendu, écran, piéton, trafic, réglage du débit (test de charge).
 */
export class DebugPanel {
  private readonly text: HTMLDivElement;
  private frames = 0;
  private accTime = 0;
  private maxSteps = 0;
  private accUpdateMs = 0;
  private accRenderMs = 0;
  private maxScooters = 0;
  private collapsed = false;
  private lastFps = 0;
  private lastUpdateMs = 0;
  private lastRenderMs = 0;
  private lastMaxSteps = 0;
  private lastMaxScooters = 0;

  constructor(
    private readonly stats: LoopStats,
    private readonly camera: Camera,
    private readonly getDpr: () => number,
    private readonly game: Game,
  ) {
    stats.measure = true;

    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
      left: '6px',
      padding: '4px 6px',
      font: '11px/1.35 ui-monospace, Menlo, monospace',
      color: '#fff',
      background: 'rgba(0,0,0,0.55)',
      borderRadius: '4px',
      zIndex: '10',
      touchAction: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // Boutons de débit : +/- 2 scooters/s, hors plafond, pour le test de charge.
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:4px;align-items:center';
    const label = document.createElement('span');
    label.textContent = 'débit';
    row.append(label, this.button('−2/s', () => this.bump(-2)), this.button('+2/s', () => this.bump(2)));
    this.text = document.createElement('div');
    this.text.style.whiteSpace = 'pre';
    root.appendChild(this.text);

    // Un tap sur le texte replie / déplie le panneau (pour voir le piéton dessous).
    this.text.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.collapsed = !this.collapsed;
      row.style.display = this.collapsed ? 'none' : 'flex';
      this.refresh();
    });

    root.appendChild(row);

    document.body.appendChild(root);
  }

  private button(text: string, onTap: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText =
      'font:inherit;color:#fff;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);' +
      'border-radius:4px;padding:4px 10px;touch-action:none';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTap();
    });
    return b;
  }

  private bump(delta: number): void {
    const t = this.game.traffic;
    t.debugRateBonus = Math.max(0, t.debugRateBonus + delta);
  }

  /** À appeler une fois par frame rendue. */
  frame(): void {
    this.frames++;
    this.accTime += this.stats.frameTime;
    this.accUpdateMs += this.stats.updateMs;
    this.accRenderMs += this.stats.renderMs;
    this.maxSteps = Math.max(this.maxSteps, this.stats.stepsLastFrame);
    this.maxScooters = Math.max(this.maxScooters, this.game.traffic.scooters.length);
    if (this.accTime < 0.5) return;

    const n = this.frames;
    this.lastFps = n / this.accTime;
    this.lastUpdateMs = this.accUpdateMs / n;
    this.lastRenderMs = this.accRenderMs / n;
    this.lastMaxSteps = this.maxSteps;
    this.lastMaxScooters = this.maxScooters;
    this.refresh();
    this.frames = 0;
    this.accTime = 0;
    this.accUpdateMs = 0;
    this.accRenderMs = 0;
    this.maxSteps = 0;
    this.maxScooters = 0;
  }

  private refresh(): void {
    const c = this.camera;
    const g = this.game;
    const t = g.traffic;
    if (this.collapsed) {
      this.text.textContent = `fps ${this.lastFps.toFixed(0)}  scooters ${t.scooters.length}  ▸`;
      return;
    }
    this.text.textContent =
      `fps ${this.lastFps.toFixed(0)}  pas/frame max ${this.lastMaxSteps}  ▾\n` +
      `simu ${this.lastUpdateMs.toFixed(2)} ms  rendu ${this.lastRenderMs.toFixed(2)} ms\n` +
      `écran ${c.width}×${c.height} px  dpr ${this.getDpr()}  ${c.scale.toFixed(1)} px/m\n` +
      `piéton v ${Math.hypot(g.ped.vx, g.ped.vy).toFixed(2)} m/s  y ${g.ped.y.toFixed(1)} m\n` +
      `scooters ${t.scooters.length} (max ${this.lastMaxScooters})  débit ${t.effectiveRate.toFixed(1)}/s\n` +
      `densité ${g.densityLevel}  temps ${g.playTime.toFixed(0)} s  graine ${g.seed}`;
  }
}

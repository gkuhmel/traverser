import type { Camera } from './camera';
import { config } from './config';
import type { Game } from './game';
import type { LoopStats } from './loop';
import { AiState, type VehicleKind } from './scooter';

/**
 * Panneau de debug (?debug=1), §9. Chargé dynamiquement : rien n'est exécuté ni téléchargé sans le paramètre.
 * - Surcouche : point fantôme, côté choisi (flèche), engagement (couleur), vitesses réelle / perçue du piéton.
 * - Curseurs en direct pour les paramètres du §5.4 et du §7 (modifient `config`).
 * - Pause / pas à pas, test de charge, fps et nombre de scooters.
 */

type ConfigKey = { [K in keyof typeof config]: (typeof config)[K] extends number ? K : never }[keyof typeof config];
type VehicleField = 'weight' | 'speedMin' | 'speedMax';

interface SliderDef {
  label: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
}

/** Curseur sur un réglage de premier niveau de `config`. */
const top = (key: ConfigKey, label: string, min: number, max: number, step: number): SliderDef => ({
  label,
  min,
  max,
  step,
  get: () => config[key],
  set: (v) => {
    config[key] = v;
  },
});

/** Curseur sur un réglage d'un type de véhicule. */
const veh = (kind: VehicleKind, field: VehicleField, label: string, min: number, max: number, step: number): SliderDef => ({
  label,
  min,
  max,
  step,
  get: () => config.vehicles[kind][field],
  set: (v) => {
    config.vehicles[kind][field] = v;
  },
});

const GROUPS: Record<string, SliderDef[]> = {
  IA: [
    top('perceptionLag', 'retard perception', 0, 1.5, 0.05),
    top('commitTime', 'engagement', 0, 1.5, 0.05),
    top('predictionHorizon', 'horizon', 0.3, 3, 0.1),
    top('safeDistance', 'écart visé', 0, 2, 0.05),
    top('panicDistance', 'écart panique', 0, 1.5, 0.05),
    top('steerMax', 'vit. latérale max', 0.5, 5, 0.1),
    top('brakeMax', 'freinage max', 0, 0.9, 0.05),
    top('awarenessRange', 'portée réaction', 3, 30, 0.5),
  ],
  Densité: [
    top('spawnRateStart', 'débit initial', 0.2, 8, 0.1),
    top('spawnRateStep', 'hausse / palier', 0, 2, 0.1),
    top('spawnRateMax', 'débit max', 0.5, 10, 0.5),
    top('densityInterval', 'durée palier', 5, 60, 1),
    top('burstMultiplier', 'rafale ×', 1, 4, 0.1),
    top('lullMultiplier', 'creux ×', 0, 1, 0.05),
    top('burstChance', 'part rafales', 0, 0.5, 0.05),
    top('lullChance', 'part creux', 0, 0.5, 0.05),
  ],
  Véhicules: [
    veh('scooter', 'weight', 'part scooters', 0, 1, 0.01),
    veh('bike', 'weight', 'part vélos', 0, 1, 0.01),
    veh('tuktuk', 'weight', 'part tuk-tuks', 0, 1, 0.01),
    veh('truck', 'weight', 'part camions', 0, 1, 0.01),
    veh('scooter', 'speedMin', 'scooter v min', 2, 12, 0.5),
    veh('scooter', 'speedMax', 'scooter v max', 2, 14, 0.5),
  ],
};

const OVERLAY = {
  watching: 'rgba(255, 255, 255, 0.35)',
  behind: '#4fd1c5',
  front: '#f6ad55',
  panic: '#ff4d4d',
  realVel: '#ffffff',
  perceivedVel: '#ff6ad5',
};

const FLOW_LABEL = { normal: '', burst: '(rafale)', lull: '(creux)' } as const;

/** Durée d'un « pas » en mode pause (s). */
const STEP_DURATION = 0.1;

export class DebugPanel {
  /** Simulation en pause (le rendu continue). */
  paused = false;
  private stepTicks = 0;

  private readonly text: HTMLDivElement;
  private readonly sliderBox: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly invBtn: HTMLButtonElement;
  private readonly defaults = new Map<SliderDef, number>();
  private openGroup: string | null = null;
  private collapsed = false;
  private readonly controls: HTMLElement[] = [];

  private frames = 0;
  private accTime = 0;
  private maxSteps = 0;
  private accUpdateMs = 0;
  private accRenderMs = 0;
  private lastFps = 0;
  private lastUpdateMs = 0;
  private lastRenderMs = 0;
  private lastMaxSteps = 0;

  constructor(
    private readonly stats: LoopStats,
    private readonly camera: Camera,
    private readonly getDpr: () => number,
    private readonly game: Game,
  ) {
    stats.measure = true;
    for (const defs of Object.values(GROUPS)) for (const d of defs) this.defaults.set(d, d.get());

    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
      left: '6px',
      // Laisse la place du bouton d'accélération en bas à droite.
      right: 'calc(env(safe-area-inset-right, 0px) + 104px)',
      maxWidth: '420px',
      padding: '5px 7px',
      font: '11px/1.35 ui-monospace, Menlo, monospace',
      color: '#fff',
      background: 'rgba(0,0,0,0.5)',
      borderRadius: '6px',
      zIndex: '10',
      touchAction: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    // Le panneau ne doit jamais transmettre de toucher au jeu.
    root.addEventListener('pointerdown', (e) => e.stopPropagation());

    this.text = document.createElement('div');
    this.text.style.whiteSpace = 'pre';
    this.text.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.collapsed = !this.collapsed;
      for (const c of this.controls) c.style.display = this.collapsed ? 'none' : '';
      this.refresh();
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;align-items:center';
    this.pauseBtn = this.button('pause', () => this.togglePause());
    this.invBtn = this.button('invincible', () => this.toggleInvincible());
    row.append(
      this.pauseBtn,
      this.button('pas', () => this.step()),
      this.invBtn,
      this.button('IA', () => this.toggleGroup('IA')),
      this.button('densité', () => this.toggleGroup('Densité')),
      this.button('véhicules', () => this.toggleGroup('Véhicules')),
      this.button('−2/s', () => this.bump(-2)),
      this.button('+2/s', () => this.bump(2)),
    );

    this.sliderBox = document.createElement('div');
    this.sliderBox.style.cssText = 'display:none;margin-top:5px';

    root.append(this.text, row, this.sliderBox);
    this.controls.push(row, this.sliderBox);
    document.body.appendChild(root);
  }

  /** La simulation doit-elle avancer d'un pas fixe ? (appelé par la boucle) */
  shouldUpdate(): boolean {
    if (!this.paused) return true;
    if (this.stepTicks > 0) {
      this.stepTicks--;
      return true;
    }
    return false;
  }

  // --- Contrôles ---

  private button(text: string, onTap: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText =
      'font:inherit;color:#fff;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);' +
      'border-radius:4px;padding:5px 9px;touch-action:none';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onTap();
    });
    return b;
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? 'reprendre' : 'pause';
  }

  private toggleInvincible(): void {
    const g = this.game;
    g.invincible = !g.invincible;
    this.invBtn.style.background = g.invincible ? 'rgba(246,173,85,0.6)' : 'rgba(255,255,255,0.15)';
    this.refresh();
  }

  private step(): void {
    if (!this.paused) this.togglePause();
    this.stepTicks += Math.round(STEP_DURATION / config.fixedDt);
  }

  private bump(delta: number): void {
    const t = this.game.traffic;
    t.debugRateBonus = Math.max(0, t.debugRateBonus + delta);
  }

  private toggleGroup(name: string): void {
    this.openGroup = this.openGroup === name ? null : name;
    this.refresh();
    this.sliderBox.replaceChildren();
    this.sliderBox.style.display = this.openGroup ? 'block' : 'none';
    if (!this.openGroup) return;
    for (const def of GROUPS[name] ?? []) this.sliderBox.appendChild(this.slider(def));
    const reset = this.button('valeurs par défaut', () => {
      for (const def of GROUPS[name] ?? []) def.set(this.defaults.get(def) ?? def.get());
      this.toggleGroup(name);
      this.toggleGroup(name);
    });
    reset.style.marginTop = '4px';
    this.sliderBox.appendChild(reset);
  }

  /** Curseur maison (Pointer Events) : fonctionne malgré le blocage global des gestes tactiles. */
  private slider(def: SliderDef): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;height:24px';
    const label = document.createElement('span');
    label.textContent = def.label;
    label.style.cssText = 'width:112px;flex:none;overflow:hidden;white-space:nowrap';
    const track = document.createElement('div');
    track.style.cssText =
      'flex:1;height:14px;border-radius:7px;background:rgba(255,255,255,0.15);position:relative;touch-action:none';
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-radius:8px;background:rgba(79,209,197,0.7)';
    track.appendChild(fill);
    const value = document.createElement('span');
    value.style.cssText = 'width:40px;flex:none;text-align:right';
    row.append(label, track, value);

    const show = (): void => {
      const v = def.get();
      fill.style.width = `${((v - def.min) / (def.max - def.min)) * 100}%`;
      const changed = Math.abs(v - (this.defaults.get(def) ?? v)) > 1e-9;
      value.textContent = String(+v.toFixed(2));
      value.style.color = changed ? '#f6ad55' : '#fff';
    };
    const setFrom = (clientX: number): void => {
      const rect = track.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = def.min + t * (def.max - def.min);
      def.set(Math.round(raw / def.step) * def.step);
      show();
    };
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      track.setPointerCapture(e.pointerId);
      setFrom(e.clientX);
    });
    track.addEventListener('pointermove', (e) => {
      if (track.hasPointerCapture(e.pointerId)) setFrom(e.clientX);
    });
    show();
    return row;
  }

  // --- Affichage texte ---

  /** À appeler une fois par frame rendue. */
  frame(): void {
    this.frames++;
    this.accTime += this.stats.frameTime;
    this.accUpdateMs += this.stats.updateMs;
    this.accRenderMs += this.stats.renderMs;
    this.maxSteps = Math.max(this.maxSteps, this.stats.stepsLastFrame);
    if (this.accTime < 0.5) return;

    const n = this.frames;
    this.lastFps = n / this.accTime;
    this.lastUpdateMs = this.accUpdateMs / n;
    this.lastRenderMs = this.accRenderMs / n;
    this.lastMaxSteps = this.maxSteps;
    this.frames = 0;
    this.accTime = 0;
    this.accUpdateMs = 0;
    this.accRenderMs = 0;
    this.maxSteps = 0;
    this.refresh();
  }

  private refresh(): void {
    const g = this.game;
    const t = g.traffic;
    if (this.collapsed || this.openGroup) {
      // Replié, ou curseurs ouverts : une seule ligne pour laisser voir la rue.
      const q = g.perception;
      this.text.textContent =
        `fps ${this.lastFps.toFixed(0)}  véhicules ${t.scooters.length}  perçu ${Math.hypot(q.vx, q.vy).toFixed(2)} m/s  ` +
        (this.collapsed ? '▸' : '▾');
      return;
    }
    let reacting = 0;
    for (const s of t.scooters) if (s.ai >= AiState.Avoiding) reacting++;
    const p = g.ped;
    const q = g.perception;
    this.text.textContent =
      `fps ${this.lastFps.toFixed(0)}  pas max ${this.lastMaxSteps}  ▾\n` +
      `simu ${this.lastUpdateMs.toFixed(2)} ms  rendu ${this.lastRenderMs.toFixed(2)} ms\n` +
      `écran ${this.camera.width}×${this.camera.height} dpr ${this.getDpr()}\n` +
      `réel  ${fmtVec(p.vx, p.vy)} ${Math.hypot(p.vx, p.vy).toFixed(2)} m/s\n` +
      `perçu ${fmtVec(q.vx, q.vy)} ${Math.hypot(q.vx, q.vy).toFixed(2)} m/s\n` +
      `véhicules ${t.scooters.length}  en évitement ${reacting}\n` +
      `débit ${t.effectiveRate.toFixed(1)}/s → ${t.currentRate.toFixed(1)}/s ${FLOW_LABEL[t.flow]}\n` +
      `densité ${g.densityLevel}  temps ${g.playTime.toFixed(0)} s\ngraine ${g.seed}\n` +
      `frôlements ${g.nearMisses}` + (g.invincible ? `  contacts ignorés ${g.ghostHits}` : '') +
      (g.sprintLeft > 0 ? `  ACCÉLÉRATION ${g.sprintLeft.toFixed(1)} s` : g.sprintCooldownLeft > 0 ? `  recharge ${g.sprintCooldownLeft.toFixed(1)} s` : '');
  }

  // --- Surcouche dessinée dans le monde (mètres) ---

  drawOverlay(ctx: CanvasRenderingContext2D, alpha: number, px: number): void {
    const g = this.game;
    const r = config.pedRadius;

    for (const s of g.traffic.scooters) {
      if (s.ai === AiState.Idle) continue;
      const L = s.length;
      const W = s.width;
      const x = s.prevX + (s.x - s.prevX) * alpha;
      const y = s.prevY + (s.y - s.prevY) * alpha;

      if (s.ai === AiState.Watching) {
        ctx.strokeStyle = OVERLAY.watching;
        ctx.lineWidth = px;
        ctx.strokeRect(x - L / 2, y - W / 2, L, W);
        continue;
      }

      const color = s.ai === AiState.Panic ? OVERLAY.panic : s.sideIsBehind ? OVERLAY.behind : OVERLAY.front;
      const committed = g.time < s.commitUntil;

      // Contour : épais pendant l'engagement.
      ctx.strokeStyle = color;
      ctx.lineWidth = (committed ? 3 : 1.5) * px;
      ctx.strokeRect(x - L / 2 - 0.08, y - W / 2 - 0.08, L + 0.16, W + 0.16);

      // Point fantôme : où le scooter croit que sera le piéton au croisement.
      ctx.setLineDash([3 * px, 3 * px]);
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(s.ghostX, s.ghostY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(s.ghostX, s.ghostY, r, 0, Math.PI * 2);
      ctx.stroke();

      // Flèche du côté choisi : du scooter vers son ordonnée cible.
      const ty = s.avoidY;
      if (Math.abs(ty - y) > 0.05) {
        const head = Math.sign(ty - y) * 0.25;
        ctx.lineWidth = 2.5 * px;
        ctx.beginPath();
        ctx.moveTo(x + L / 2, y);
        ctx.lineTo(x + L / 2, ty);
        ctx.moveTo(x + L / 2 - 0.18, ty - head);
        ctx.lineTo(x + L / 2, ty);
        ctx.lineTo(x + L / 2 + 0.18, ty - head);
        ctx.stroke();
      }
    }

    // Vitesses du piéton (vecteurs sur 1 s) : réelle en blanc, perçue en rose.
    const p = g.ped;
    const px0 = p.prevX + (p.x - p.prevX) * alpha;
    const py0 = p.prevY + (p.y - p.prevY) * alpha;
    this.vector(ctx, px0, py0, p.vx, p.vy, OVERLAY.realVel, px);
    this.vector(ctx, px0, py0, g.perception.vx, g.perception.vy, OVERLAY.perceivedVel, px);
  }

  private vector(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, color: string, px: number): void {
    const len = Math.hypot(vx, vy);
    if (len < 0.02) return;
    const ex = x + vx;
    const ey = y + vy;
    const ux = vx / len;
    const uy = vy / len;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * px;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex - ux * 0.2 - uy * 0.12, ey - uy * 0.2 + ux * 0.12);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - ux * 0.2 + uy * 0.12, ey - uy * 0.2 - ux * 0.12);
    ctx.stroke();
  }
}

function fmtVec(x: number, y: number): string {
  const f = (v: number): string => (v >= 0 ? ' ' : '') + v.toFixed(2);
  return `(${f(x)}, ${f(y)})`;
}

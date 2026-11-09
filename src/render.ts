import type { Camera } from './camera';
import { config } from './config';
import type { Game } from './game';
import type { Scooter } from './scooter';

const COLORS = {
  background: '#2a211c',
  asphalt: '#3b322c',
  laneMark: 'rgba(235, 215, 180, 0.13)',
  sidewalk: '#b9a48a',
  tileLine: 'rgba(90, 70, 50, 0.22)',
  curb: '#d8c8b0',
  curbShadow: 'rgba(0, 0, 0, 0.25)',
  shadow: 'rgba(0, 0, 0, 0.3)',
  pedBody: '#2f6f6a',
  hat: '#f1d79a',
  hatRing: 'rgba(150, 110, 50, 0.55)',
  hatTip: '#e0bb6a',
  hudText: '#fff3e0',
  hudShadow: 'rgba(0, 0, 0, 0.45)',
  hint: 'rgba(255, 243, 224, 0.85)',
  hudDim: 'rgba(255, 243, 224, 0.55)',
  record: '#f6c35b',
  scooterShadow: 'rgba(0, 0, 0, 0.32)',
  seat: 'rgba(25, 20, 18, 0.75)',
  headlight: '#fff6c8',
  taillight: '#d8433a',
  tire: '#1d1a18',
  canopy: '#e9dcc0',
  canopyLine: 'rgba(120, 90, 50, 0.35)',
  windshield: '#2b3a44',
  boxLine: 'rgba(0, 0, 0, 0.18)',
};

/** Carrosseries : palette chaude (lanternes, ocre, vert d'eau) + quelques neutres. Taille = SCOOTER_COLOR_COUNT. */
const SCOOTER_COLORS = ['#c8432f', '#e08a2c', '#d9b23e', '#5fa39a', '#3f7fa8', '#8e5aa0', '#e9e1d2', '#6b6f73'];
/** Chemises des cyclistes. */
const SHIRT_COLORS = ['#e9e1d2', '#5fa39a', '#c8432f', '#3f7fa8', '#d9b23e'];
/** Tuk-tuks : vert d'eau, ocre, rouge lanterne, bleu. */
const TUKTUK_COLORS = ['#3f9d8f', '#d9922c', '#b8392b', '#3f6fa8'];
/** Petits camions : cabine colorée, caisse neutre (bâche). */
const TRUCK_CAB_COLORS = ['#3f6fa8', '#c8432f', '#e9e1d2', '#4b8a5a'];
const TRUCK_BOX_COLORS = ['#8a9a7b', '#c9bfa8', '#5d7d96', '#b7a07a'];
/** Casques des conducteurs. */
const HELMET_COLORS = ['#f2c14e', '#e85d4a', '#3a7ca5', '#f4efe6', '#7bb37a', '#2b2b2b'];

/** Taille d'un carreau de trottoir (m) : purement décoratif. */
const TILE = 1;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  /** Marge haute de sécurité (encoche / Dynamic Island), en px CSS. */
  safeTop = 0;
  /** Surcouche de debug dessinée en mètres (null hors ?debug=1 : aucun coût). */
  overlay: ((ctx: CanvasRenderingContext2D, alpha: number, px: number) => void) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
  }

  /** Redimensionne le canvas en pixels physiques. */
  resize(cssWidth: number, cssHeight: number, dpr: number, safeTop: number): void {
    this.dpr = dpr;
    this.safeTop = safeTop;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
  }

  render(game: Game, alpha: number): void {
    const { ctx, camera, dpr } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Hors partie (impact, fin), la simulation est figée : pas d'interpolation.
    if (game.phase !== 'playing') alpha = 1;

    // Tremblement d'écran à l'impact (rendu seulement : n'affecte pas la simulation).
    const shakeT = game.phase === 'playing' ? Infinity : game.phase === 'hit' ? game.phaseTime : game.phaseTime + config.hitStopDuration;
    const shake = shakeT < config.shakeDuration ? config.shakeAmplitude * (1 - shakeT / config.shakeDuration) : 0;
    const camX = camera.x;
    const camY = camera.y;
    camera.x += (Math.random() * 2 - 1) * shake;
    camera.y += (Math.random() * 2 - 1) * shake;

    // Monde, en mètres.
    camera.apply(ctx, dpr);
    const px = 1 / camera.scale;
    this.drawStreet(px);
    this.drawScooters(game, alpha);
    this.drawNearMisses(game, px);
    this.drawPedestrian(game, alpha);
    this.overlay?.(ctx, alpha, px);
    camera.x = camX;
    camera.y = camY;

    // HUD, en pixels CSS.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (game.phase === 'hit') this.drawHitFlash(game);
    if (game.phase === 'over') this.drawGameOver(game);
    else this.drawHud(game);
  }

  /** Frôlement : traits de vent dans le sillage du scooter et bref halo autour du piéton. */
  private drawNearMisses(game: Game, px: number): void {
    const { ctx } = this;
    for (const f of game.nearMissFx) {
      const t = f.age / config.nearMissFxDuration;
      const a = 1 - t;
      ctx.strokeStyle = `rgba(255, 250, 235, ${0.75 * a})`;
      ctx.lineWidth = 2 * px;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const y = f.y + i * 0.22;
        const x0 = f.x + f.dir * (0.4 + t * 1.2) - f.dir * Math.abs(i) * 0.3;
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - f.dir * (1.1 - Math.abs(i) * 0.35), y);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';

      const p = game.ped;
      ctx.strokeStyle = `rgba(255, 250, 235, ${0.6 * a})`;
      ctx.lineWidth = 2.5 * px;
      ctx.beginPath();
      ctx.arc(p.x, p.y, config.pedRadius + 0.1 + t * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Flash rouge qui s'estompe pendant l'arrêt sur image. */
  private drawHitFlash(game: Game): void {
    const a = Math.max(0, 1 - game.phaseTime / config.hitStopDuration) * 0.35;
    this.ctx.fillStyle = `rgba(220, 60, 40, ${a})`;
    this.ctx.fillRect(0, 0, this.camera.width, this.camera.height);
  }

  /** Écran de fin : traversées, meilleur score, frôlements, « Toucher pour rejouer ». */
  private drawGameOver(game: Game): void {
    const { ctx, camera } = this;
    const fade = Math.min(1, game.phaseTime / 0.25);
    const cx = camera.width / 2;
    const cy = camera.height * 0.42;

    ctx.fillStyle = `rgba(20, 14, 10, ${0.68 * fade})`;
    ctx.fillRect(0, 0, camera.width, camera.height);

    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '600 22px -apple-system, system-ui, sans-serif';
    ctx.fillText('Renversé !', cx, cy - 92);

    ctx.font = '700 72px -apple-system, system-ui, sans-serif';
    ctx.fillText(String(game.crossings), cx, cy - 22);
    ctx.font = '15px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = COLORS.hint;
    ctx.fillText(game.crossings > 1 ? 'traversées' : 'traversée', cx, cy + 26);

    ctx.font = '600 16px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = game.newRecord ? COLORS.record : COLORS.hudText;
    ctx.fillText(game.newRecord ? `Nouveau record !` : `Meilleur : ${game.best}`, cx, cy + 66);
    ctx.font = '14px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(`${game.nearMisses} frôlement${game.nearMisses > 1 ? 's' : ''}`, cx, cy + 94);

    if (game.phaseTime >= config.replayDelay) {
      const pulse = 0.65 + 0.35 * Math.sin(game.phaseTime * 4);
      ctx.globalAlpha = fade * pulse;
      ctx.fillStyle = COLORS.hudText;
      ctx.font = '600 18px -apple-system, system-ui, sans-serif';
      ctx.fillText('Toucher pour rejouer', cx, camera.height * 0.78);
    }
    ctx.globalAlpha = 1;
  }

  private drawStreet(px: number): void {
    const { ctx, camera } = this;
    const half = config.streetWidth / 2;
    const outer = half + config.sidewalkDepth;
    const left = camera.x - camera.viewWidthM / 2 - 1;
    const right = camera.x + camera.viewWidthM / 2 + 1;
    const top = camera.y - camera.viewHeightM / 2 - 1;
    const bottom = camera.y + camera.viewHeightM / 2 + 1;
    const w = right - left;

    // Chaussée.
    ctx.fillStyle = COLORS.asphalt;
    ctx.fillRect(left, -half, w, config.streetWidth);

    // Voies informelles : marquage discontinu et effacé.
    ctx.strokeStyle = COLORS.laneMark;
    ctx.lineWidth = 0.12;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    for (let i = 1; i < config.laneCount; i++) {
      const y = -half + (config.streetWidth * i) / config.laneCount;
      ctx.moveTo(Math.floor(left / 5) * 5, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Trottoirs carrelés (et au-delà, jusqu'au bord de l'écran).
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(left, Math.min(top, -outer), w, Math.max(0, -half - Math.min(top, -outer)));
    ctx.fillRect(left, half, w, Math.max(0, Math.max(bottom, outer) - half));

    ctx.strokeStyle = COLORS.tileLine;
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let x = Math.floor(left / TILE) * TILE; x <= right; x += TILE) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, -half);
      ctx.moveTo(x, half);
      ctx.lineTo(x, bottom);
    }
    for (let y = half + TILE; y <= bottom; y += TILE) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.moveTo(left, -y);
      ctx.lineTo(right, -y);
    }
    ctx.stroke();

    // Bordures de trottoir.
    ctx.fillStyle = COLORS.curbShadow;
    ctx.fillRect(left, -half, w, 0.15);
    ctx.fillRect(left, half, w, 0.08);
    ctx.fillStyle = COLORS.curb;
    ctx.fillRect(left, -half - 0.2, w, 0.2);
    ctx.fillRect(left, half, w, 0.2);
  }

  private drawScooters(game: Game, alpha: number): void {
    const { camera } = this;
    for (const s of game.traffic.scooters) {
      const x = s.prevX + (s.x - s.prevX) * alpha;
      if (Math.abs(x - camera.x) > camera.viewWidthM / 2 + s.length) continue;
      const y = s.prevY + (s.y - s.prevY) * alpha;
      const angle = Math.atan2(s.vy, s.vx === 0 ? s.dir : s.vx);
      this.drawVehicle(s, x, y, angle);
    }
  }

  /** Véhicule vu de dessus, avant = +x dans son repère local. */
  private drawVehicle(s: Scooter, x: number, y: number, angle: number): void {
    const { ctx } = this;
    const L = s.length;
    const W = s.width;

    // Ombre décalée dans le repère de la rue (lumière fixe, quel que soit le sens).
    ctx.save();
    ctx.translate(x + 0.08, y + 0.1);
    ctx.rotate(angle);
    ctx.fillStyle = COLORS.scooterShadow;
    roundRect(ctx, -L / 2, -W / 2, L, W, Math.min(s.cornerRadius, W / 2));
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    switch (s.kind) {
      case 'bike':
        this.drawBike(s, L, W);
        break;
      case 'tuktuk':
        this.drawTuktuk(s, L, W);
        break;
      case 'truck':
        this.drawTruck(s, L, W);
        break;
      default:
        this.drawScooterBody(s, L, W);
    }
    ctx.restore();
  }

  private drawScooterBody(s: Scooter, L: number, W: number): void {
    const { ctx } = this;
    ctx.fillStyle = SCOOTER_COLORS[s.colorIndex] ?? '#888';
    roundRect(ctx, -L / 2, -W / 2, L, W, W / 2);
    ctx.fill();
    // Selle, feu arrière, phare.
    ctx.fillStyle = COLORS.seat;
    roundRect(ctx, -L * 0.32, -W * 0.28, L * 0.42, W * 0.56, W * 0.25);
    ctx.fill();
    ctx.fillStyle = COLORS.taillight;
    ctx.fillRect(-L / 2 + 0.02, -0.08, 0.06, 0.16);
    ctx.fillStyle = COLORS.headlight;
    ctx.beginPath();
    ctx.arc(L / 2 - 0.12, 0, 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Conducteur : casque vu de dessus.
    ctx.fillStyle = HELMET_COLORS[s.colorIndex % HELMET_COLORS.length] ?? '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Vélo : roues et cadre fins, cycliste au centre (épaules + chapeau). */
  private drawBike(s: Scooter, L: number, W: number): void {
    const { ctx } = this;
    ctx.fillStyle = COLORS.tire;
    roundRect(ctx, L / 2 - 0.55, -0.05, 0.55, 0.1, 0.05);
    ctx.fill();
    roundRect(ctx, -L / 2, -0.05, 0.55, 0.1, 0.05);
    ctx.fill();
    ctx.strokeStyle = SCOOTER_COLORS[s.colorIndex] ?? '#888';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(-L / 2 + 0.3, 0);
    ctx.lineTo(L / 2 - 0.25, 0);
    ctx.moveTo(L / 2 - 0.35, -W * 0.42);
    ctx.lineTo(L / 2 - 0.35, W * 0.42);
    ctx.stroke();
    // Cycliste : épaules (chemise) et chapeau.
    ctx.fillStyle = SHIRT_COLORS[s.colorIndex % SHIRT_COLORS.length] ?? '#ddd';
    ctx.beginPath();
    ctx.ellipse(-0.05, 0, 0.2, W * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.hat;
    ctx.beginPath();
    ctx.arc(-0.02, 0, 0.21, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Tuk-tuk : cabine avant étroite (conducteur), banquette arrière sous une bâche. */
  private drawTuktuk(s: Scooter, L: number, W: number): void {
    const { ctx } = this;
    const body = TUKTUK_COLORS[s.colorIndex % TUKTUK_COLORS.length] ?? '#3a8';
    // Avant étroit.
    ctx.fillStyle = body;
    roundRect(ctx, L / 2 - 0.95, -W * 0.3, 0.95, W * 0.6, W * 0.28);
    ctx.fill();
    ctx.fillStyle = COLORS.headlight;
    ctx.beginPath();
    ctx.arc(L / 2 - 0.1, 0, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HELMET_COLORS[s.colorIndex % HELMET_COLORS.length] ?? '#fff';
    ctx.beginPath();
    ctx.arc(L / 2 - 0.62, 0, 0.19, 0, Math.PI * 2);
    ctx.fill();
    // Caisse arrière + bâche à rayures.
    ctx.fillStyle = body;
    roundRect(ctx, -L / 2, -W / 2, L - 0.85, W, 0.25);
    ctx.fill();
    ctx.fillStyle = COLORS.canopy;
    roundRect(ctx, -L / 2 + 0.08, -W / 2 + 0.08, L - 1.05, W - 0.16, 0.2);
    ctx.fill();
    ctx.strokeStyle = COLORS.canopyLine;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const xx = -L / 2 + 0.08 + ((L - 1.05) * i) / 4;
      ctx.moveTo(xx, -W / 2 + 0.12);
      ctx.lineTo(xx, W / 2 - 0.12);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.taillight;
    ctx.fillRect(-L / 2 + 0.02, -W * 0.38, 0.06, 0.14);
    ctx.fillRect(-L / 2 + 0.02, W * 0.38 - 0.14, 0.06, 0.14);
  }

  /** Petit camion : cabine colorée avec pare-brise, caisse bâchée nervurée. */
  private drawTruck(s: Scooter, L: number, W: number): void {
    const { ctx } = this;
    const cab = 1.15;
    ctx.fillStyle = TRUCK_CAB_COLORS[s.colorIndex % TRUCK_CAB_COLORS.length] ?? '#36c';
    roundRect(ctx, L / 2 - cab, -W / 2 + 0.05, cab, W - 0.1, 0.25);
    ctx.fill();
    ctx.fillStyle = COLORS.windshield;
    roundRect(ctx, L / 2 - 0.42, -W / 2 + 0.18, 0.26, W - 0.36, 0.08);
    ctx.fill();
    ctx.fillStyle = COLORS.headlight;
    ctx.fillRect(L / 2 - 0.08, -W / 2 + 0.12, 0.07, 0.25);
    ctx.fillRect(L / 2 - 0.08, W / 2 - 0.37, 0.07, 0.25);
    // Caisse.
    ctx.fillStyle = TRUCK_BOX_COLORS[s.colorIndex % TRUCK_BOX_COLORS.length] ?? '#ccc';
    roundRect(ctx, -L / 2, -W / 2, L - cab - 0.06, W, 0.12);
    ctx.fill();
    ctx.strokeStyle = COLORS.boxLine;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const xx = -L / 2 + ((L - cab - 0.06) * i) / 6;
      ctx.moveTo(xx, -W / 2 + 0.1);
      ctx.lineTo(xx, W / 2 - 0.1);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.taillight;
    ctx.fillRect(-L / 2, -W / 2 + 0.1, 0.07, 0.22);
    ctx.fillRect(-L / 2, W / 2 - 0.32, 0.07, 0.22);
  }

  private drawPedestrian(game: Game, alpha: number): void {
    const { ctx } = this;
    const p = game.ped;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    const heading = lerpAngle(p.prevHeading, p.heading, alpha);
    const phase = p.prevStepPhase + (p.stepPhase - p.prevStepPhase) * alpha;
    const r = config.pedRadius;

    // Balancement latéral de la marche (perpendiculaire au cap).
    const sway = Math.sin(phase) * config.stepSway;
    const sx = x + Math.cos(heading + Math.PI / 2) * sway;
    const sy = y + Math.sin(heading + Math.PI / 2) * sway;

    // Accélération : traînée de vitesse derrière le piéton.
    if (game.sprintLeft > 0) {
      const a = Math.min(1, game.sprintLeft / 0.3);
      ctx.strokeStyle = `rgba(255, 211, 107, ${0.7 * a})`;
      ctx.lineWidth = 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const bx = -Math.cos(heading);
      const by = -Math.sin(heading);
      for (let i = -1; i <= 1; i++) {
        const ox = -by * i * 0.18;
        const oy = bx * i * 0.18;
        const start = r + 0.12 + Math.abs(i) * 0.08;
        ctx.moveTo(sx + bx * start + ox, sy + by * start + oy);
        ctx.lineTo(sx + bx * (start + 0.55 - Math.abs(i) * 0.15) + ox, sy + by * (start + 0.55 - Math.abs(i) * 0.15) + oy);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // Ombre portée.
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(sx + 0.08, sy + 0.1, r * 1.15, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Épaules (dépassent légèrement du chapeau sur les côtés).
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(heading);
    ctx.fillStyle = COLORS.pedBody;
    ctx.beginPath();
    ctx.ellipse(-0.04, 0, r * 0.55, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Nón lá vu de dessus : disque clair, anneaux et pointe.
    ctx.fillStyle = COLORS.hat;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.hatRing;
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.66, 0, Math.PI * 2);
    ctx.moveTo(sx + r * 0.33, sy);
    ctx.arc(sx, sy, r * 0.33, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.hatTip;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHud(game: Game): void {
    const { ctx, camera } = this;
    const cx = camera.width / 2;
    const top = this.safeTop + 18;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = COLORS.hudShadow;
    ctx.shadowBlur = 4;
    ctx.fillStyle = COLORS.hudText;
    ctx.font = '600 34px -apple-system, system-ui, sans-serif';
    ctx.fillText(String(game.crossings), cx, top);

    // Niveau de densité, discret ; il s'éclaire brièvement à chaque nouveau palier.
    const since = game.time - game.densityChangedAt;
    const glow = since < config.densityFlashDuration ? 1 - since / config.densityFlashDuration : 0;
    ctx.fillStyle = glow > 0 ? `rgba(246, 195, 91, ${0.55 + 0.45 * glow})` : COLORS.hudDim;
    ctx.font = `${glow > 0 ? '600 ' : ''}13px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`densité ${game.densityLevel}`, camera.width - 14, top + 4);
    ctx.textAlign = 'center';

    // Consigne minimale tant que la première traversée n'a pas commencé.
    if (game.crossings === 0 && !game.canWalk) {
      ctx.fillStyle = COLORS.hint;
      ctx.font = '17px -apple-system, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('Garde le doigt posé pour traverser', cx, camera.height * 0.5);
    }
    ctx.shadowBlur = 0;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

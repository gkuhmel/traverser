import type { Camera } from './camera';
import { config } from './config';
import type { Game } from './game';

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
};

/** Taille d'un carreau de trottoir (m) : purement décoratif. */
const TILE = 1;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  /** Marge haute de sécurité (encoche / Dynamic Island), en px CSS. */
  safeTop = 0;

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

    // Monde, en mètres.
    camera.apply(ctx, dpr);
    const px = 1 / camera.scale;
    this.drawStreet(px);
    this.drawPedestrian(game, alpha);

    // HUD, en pixels CSS.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(game);
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

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

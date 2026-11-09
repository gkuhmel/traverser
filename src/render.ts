import type { Camera } from './camera';
import type { Game } from './game';

const COLORS = {
  background: '#2a211c',
  gridMinor: 'rgba(255, 230, 200, 0.06)',
  gridMajor: 'rgba(255, 230, 200, 0.16)',
  axis: 'rgba(240, 170, 90, 0.45)',
  marker: '#e9c46a',
  touch: '#7fc8b8',
  text: 'rgba(255, 240, 220, 0.7)',
};

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
  }

  /** Redimensionne le canvas en pixels physiques. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
  }

  render(game: Game, alpha: number): void {
    const { ctx, camera, dpr } = this;

    // Fond (en pixels physiques).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Tout le reste est dessiné en mètres.
    camera.apply(ctx, dpr);
    const px = 1 / camera.scale; // 1 pixel CSS en mètres

    this.drawGrid(px);

    // Marqueur interpolé entre les deux derniers pas de simulation.
    const mx = game.markerPrevX + (game.markerX - game.markerPrevX) * alpha;
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(mx, 0, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Doigt.
    if (game.touchWorld) {
      ctx.strokeStyle = COLORS.touch;
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.arc(game.touchWorld.x, game.touchWorld.y, 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Texte d'information (en pixels CSS).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const t = game.touchWorld;
    const label = t ? `doigt : ${t.x.toFixed(2)} m, ${t.y.toFixed(2)} m` : 'pose le doigt';
    ctx.fillText(label, camera.width / 2, camera.height * 0.75);
    ctx.fillText(`appuis : ${game.pressCount}`, camera.width / 2, camera.height * 0.75 + 22);
  }

  /** Grille de 1 m (majeure tous les 5 m) et axes passant par l'origine. */
  private drawGrid(px: number): void {
    const { ctx, camera } = this;
    const halfW = camera.viewWidthM / 2 + 1;
    const halfH = camera.viewHeightM / 2 + 1;
    const x0 = Math.floor(camera.x - halfW);
    const x1 = Math.ceil(camera.x + halfW);
    const y0 = Math.floor(camera.y - halfH);
    const y1 = Math.ceil(camera.y + halfH);

    ctx.lineWidth = px;
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        if ((x % 5 === 0) !== major) continue;
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = y0; y <= y1; y++) {
        if ((y % 5 === 0) !== major) continue;
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x1, 0);
    ctx.moveTo(0, y0);
    ctx.lineTo(0, y1);
    ctx.stroke();
  }
}

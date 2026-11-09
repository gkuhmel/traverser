import { config } from './config';

/**
 * Caméra : convertit les mètres du monde en pixels CSS.
 * Repère du monde : x vers la droite, y vers le bas, origine au centre de la rue.
 */
export class Camera {
  /** Centre visé dans le monde (m). */
  x = 0;
  y = 0;
  /** Pixels CSS par mètre. */
  scale = 1;
  /** Taille de l'écran en pixels CSS. */
  width = 1;
  height = 1;

  resize(cssWidth: number, cssHeight: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.scale = Math.min(cssHeight / config.viewHeight, cssWidth / config.viewMinWidth);
  }

  /** Largeur et hauteur de monde visibles (m). */
  get viewWidthM(): number {
    return this.width / this.scale;
  }
  get viewHeightM(): number {
    return this.height / this.scale;
  }

  worldToScreenX(wx: number): number {
    return (wx - this.x) * this.scale + this.width / 2;
  }
  worldToScreenY(wy: number): number {
    return (wy - this.y) * this.scale + this.height / 2;
  }
  screenToWorldX(sx: number): number {
    return (sx - this.width / 2) / this.scale + this.x;
  }
  screenToWorldY(sy: number): number {
    return (sy - this.height / 2) / this.scale + this.y;
  }

  /** Applique la transformation monde → pixels physiques au contexte. */
  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const s = this.scale * dpr;
    ctx.setTransform(
      s,
      0,
      0,
      s,
      (this.width / 2 - this.x * this.scale) * dpr,
      (this.height / 2 - this.y * this.scale) * dpr,
    );
  }
}

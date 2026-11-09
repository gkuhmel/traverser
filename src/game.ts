import type { Camera } from './camera';
import { config } from './config';
import type { Input } from './input';

/**
 * État de partie. Pour l'étape 1, contient seulement une scène de test :
 * un marqueur qui oscille (pour juger la fluidité du pas fixe + interpolation)
 * et la position du doigt convertie en mètres (pour vérifier la caméra).
 */
export class Game {
  /** Temps de simulation écoulé (s). */
  time = 0;

  /** Marqueur de test : positions précédente et courante (m), pour l'interpolation. */
  markerPrevX = 0;
  markerX = 0;

  /** Doigt en coordonnées monde (m), ou null si levé. */
  touchWorld: { x: number; y: number } | null = null;
  /** Nombre d'appuis détectés (vérifie les fronts montants). */
  pressCount = 0;

  constructor(
    private readonly input: Input,
    private readonly camera: Camera,
  ) {}

  update(dt: number): void {
    this.time += dt;

    this.markerPrevX = this.markerX;
    const w = (2 * Math.PI) / config.testMarkerPeriod;
    this.markerX = config.testMarkerAmplitude * Math.sin(w * this.time);

    while (this.input.consumePress()) this.pressCount++;
    while (this.input.consumeRelease()) {
      // rien pour l'instant
    }

    this.touchWorld = this.input.down
      ? { x: this.camera.screenToWorldX(this.input.x), y: this.camera.screenToWorldY(this.input.y) }
      : null;
  }
}

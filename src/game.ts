import type { Camera } from './camera';
import { config } from './config';
import type { Input } from './input';
import { Pedestrian } from './pedestrian';

/** État de partie : piéton, traversées, allers-retours. */
export class Game {
  /** Temps de simulation écoulé (s). */
  time = 0;
  readonly ped = new Pedestrian();
  /** Nombre de traversées réussies. */
  crossings = 0;
  /**
   * Le piéton a-t-il le droit d'avancer ? Repasse à false à chaque arrivée :
   * il faut relever puis reposer le doigt pour repartir.
   */
  canWalk = false;

  constructor(
    private readonly input: Input,
    private readonly camera: Camera,
  ) {}

  update(dt: number): void {
    this.time += dt;

    // Un nouvel appui (après un relâchement) autorise à repartir.
    while (this.input.consumePress()) this.canWalk = true;
    while (this.input.consumeRelease()) {
      // le relâchement suffit à arrêter : `input.down` passe à false
    }

    const walking = this.input.down && this.canWalk;
    // Consigne latérale : déplacement horizontal du doigt depuis son point de pose.
    const lateral = walking
      ? (this.input.x - this.input.startX) / (this.camera.width * config.lateralFullDeflect)
      : 0;

    this.ped.update(dt, walking, lateral);

    if (this.ped.hasArrived()) {
      this.crossings++;
      this.ped.dir = this.ped.dir < 0 ? 1 : -1;
      this.canWalk = false;
    }
  }
}

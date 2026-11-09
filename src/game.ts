import type { Camera } from './camera';
import { config } from './config';
import type { Input } from './input';
import { Pedestrian } from './pedestrian';
import { Rng } from './rng';
import { Traffic } from './traffic';

/** État de partie : piéton, trafic, traversées, densité. */
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

  /** Graine de la partie (affichée en debug pour rejouer une situation). */
  readonly seed = (Date.now() ^ 0x5bd1e995) >>> 0;
  readonly rng = new Rng(this.seed);
  readonly traffic = new Traffic(this.rng);
  /** Temps de jeu (s), compté à partir du premier appui. */
  playTime = 0;
  started = false;
  /** Palier de densité courant (1, 2, 3…). */
  densityLevel = 1;

  constructor(
    private readonly input: Input,
    private readonly camera: Camera,
  ) {
    for (let t = 0; t < config.trafficPrewarm; t += config.fixedDt) this.traffic.update(config.fixedDt);
  }

  update(dt: number): void {
    this.time += dt;

    // Un nouvel appui (après un relâchement) autorise à repartir.
    while (this.input.consumePress()) {
      this.canWalk = true;
      this.started = true;
    }
    while (this.input.consumeRelease()) {
      // le relâchement suffit à arrêter : `input.down` passe à false
    }

    const walking = this.input.down && this.canWalk;
    // Consigne latérale : déplacement horizontal du doigt depuis son point de pose.
    const lateral = walking
      ? (this.input.x - this.input.startX) / (this.camera.width * config.lateralFullDeflect)
      : 0;

    this.ped.update(dt, walking, lateral);

    // Densité : un palier toutes les densityInterval secondes de jeu.
    if (this.started) this.playTime += dt;
    this.densityLevel = 1 + Math.floor(this.playTime / config.densityInterval);
    this.traffic.spawnRate = Math.min(
      config.spawnRateStart + config.spawnRateStep * (this.densityLevel - 1),
      config.spawnRateMax,
    );
    this.traffic.update(dt);

    if (this.ped.hasArrived()) {
      this.crossings++;
      this.ped.dir = this.ped.dir < 0 ? 1 : -1;
      this.canWalk = false;
    }
  }
}

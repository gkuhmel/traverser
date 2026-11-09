import type { Camera } from './camera';
import { config } from './config';
import type { Input } from './input';
import { Pedestrian } from './pedestrian';
import { Rng } from './rng';
import type { PedPerception } from './scooter';
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
  readonly seed: number;
  readonly rng: Rng;
  readonly traffic: Traffic;
  /** Temps de jeu (s), compté à partir du premier appui. */
  playTime = 0;
  started = false;
  /** Palier de densité courant (1, 2, 3…). */
  densityLevel = 1;

  /** Ce que les scooters perçoivent du piéton : vitesse lissée avec retard (§5.2). */
  readonly perception: PedPerception = { x: 0, y: 0, vx: 0, vy: 0, radius: config.pedRadius };

  constructor(
    private readonly input: Input,
    private readonly camera: Camera,
    seed?: number,
  ) {
    this.seed = (seed ?? Date.now() ^ 0x5bd1e995) >>> 0;
    this.rng = new Rng(this.seed);
    this.traffic = new Traffic(this.rng);
    this.updatePerception(config.fixedDt);
    for (let t = 0; t < config.trafficPrewarm; t += config.fixedDt) {
      this.traffic.update(config.fixedDt, -config.trafficPrewarm + t, this.perception);
    }
  }

  /** Vitesse perçue = moyenne mobile exponentielle de la vitesse réelle (constante de temps perceptionLag). */
  private updatePerception(dt: number): void {
    const p = this.perception;
    const ped = this.ped;
    const k = config.perceptionLag > 0 ? 1 - Math.exp(-dt / config.perceptionLag) : 1;
    p.vx += (ped.vx - p.vx) * k;
    p.vy += (ped.vy - p.vy) * k;
    p.x = ped.x;
    p.y = ped.y;
    p.radius = config.pedRadius;
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
    this.updatePerception(dt);
    this.traffic.update(dt, this.time, this.perception);

    if (this.ped.hasArrived()) {
      this.crossings++;
      this.ped.dir = this.ped.dir < 0 ? 1 : -1;
      this.canWalk = false;
    }
  }
}

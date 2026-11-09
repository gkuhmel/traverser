import { config } from './config';

/**
 * Modèle du piéton. Position en mètres (y vers le bas).
 * `dir` = -1 : il traverse vers le haut ; +1 : vers le bas.
 */
export class Pedestrian {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  /** Vitesse réelle (m/s), lue plus tard par l'IA des scooters via un lissage. */
  vx = 0;
  vy = 0;
  /** Sens de traversée courant. */
  dir: -1 | 1 = -1;
  /** Orientation affichée (rad, 0 = vers la droite), tourne en douceur vers le sens de traversée. */
  heading = -Math.PI / 2;
  prevHeading = -Math.PI / 2;
  /** Phase de l'oscillation de marche (rad). */
  stepPhase = 0;
  prevStepPhase = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    const half = config.streetWidth / 2;
    this.x = 0;
    this.y = half + config.pedStartOffset;
    this.vx = this.vy = 0;
    this.dir = -1;
    this.heading = this.prevHeading = -Math.PI / 2;
    this.stepPhase = this.prevStepPhase = 0;
    this.savePrev();
  }

  savePrev(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevHeading = this.heading;
    this.prevStepPhase = this.stepPhase;
  }

  /**
   * @param walking  le piéton doit-il avancer ?
   * @param lateral  consigne latérale dans [-1, 1] (fraction de lateralMaxSpeed)
   * @param speedMul multiplicateur de la vitesse de marche (accélération)
   */
  update(dt: number, walking: boolean, lateral: number, speedMul = 1): void {
    this.savePrev();

    // Vitesse d'avance : rampe linéaire vers la consigne (pas de marche arrière).
    const targetForward = walking ? config.walkSpeed * speedMul : 0;
    let forward = this.vy * this.dir;
    // Au-delà de la vitesse de marche (accélération), la rampe est plus douce, dans les deux sens.
    const beyondWalk = Math.max(forward, targetForward) > config.walkSpeed + 1e-6 && targetForward > 0;
    const rate = beyondWalk ? config.sprintAccel : targetForward > forward ? config.pedAccel : config.pedDecel;
    forward = approach(forward, targetForward, rate * dt);
    this.vy = forward * this.dir;

    // Dérive latérale, uniquement pendant la marche.
    const targetLateral = walking ? clamp(lateral, -1, 1) * config.lateralMaxSpeed : 0;
    const latRate = (Math.abs(targetLateral) > Math.abs(this.vx) ? config.pedAccel : config.pedDecel) * dt;
    this.vx = approach(this.vx, targetLateral, latRate);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bornes : largeur d'écran et trottoirs.
    if (Math.abs(this.x) > config.pedMaxX) {
      this.x = Math.sign(this.x) * config.pedMaxX;
      this.vx = 0;
    }
    const yMax = config.streetWidth / 2 + config.sidewalkDepth - config.pedRadius;
    if (Math.abs(this.y) > yMax) {
      this.y = Math.sign(this.y) * yMax;
      this.vy = 0;
    }

    // Oscillation de marche proportionnelle à la distance parcourue.
    const speed = Math.hypot(this.vx, this.vy);
    this.stepPhase += (speed * dt * Math.PI) / config.stepLength;

    // Demi-tour visuel progressif.
    const targetHeading = this.dir < 0 ? -Math.PI / 2 : Math.PI / 2;
    let delta = targetHeading - this.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const maxTurn = config.turnRate * dt;
    this.heading += clamp(delta, -maxTurn, maxTurn);
  }

  /** Le piéton a-t-il atteint le trottoir opposé ? */
  hasArrived(): boolean {
    return this.y * this.dir >= config.streetWidth / 2 + config.arrivalMargin;
  }

  /** Le piéton est-il sur un trottoir (hors chaussée) ? */
  isOnSidewalk(): boolean {
    return Math.abs(this.y) >= config.streetWidth / 2 + config.pedRadius;
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

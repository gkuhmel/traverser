import { config } from './config';

/**
 * Un scooter. Position = centre de la capsule (m).
 * `dir` = +1 : roule vers la droite ; -1 : vers la gauche (double sens).
 * L'IA d'évitement du piéton viendra à l'étape 4.
 */
export class Scooter {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  /** Vitesse longitudinale signée (m/s) et latérale (m/s). */
  vx = 0;
  vy = 0;
  dir: 1 | -1 = 1;
  /** Vitesse de croisière propre (m/s, positive). */
  cruise = 7;
  /** Position verticale de confort (m). */
  comfortY = 0;
  /** Index de couleur (rendu uniquement). */
  colorIndex = 0;

  /** Consignes calculées par le trafic à chaque pas (séparation, suivi). */
  sepVy = 0;
  speedLimit = Infinity;

  /** Avance d'un pas : vitesse vers la consigne, latéral vers le confort + séparation. */
  integrate(dt: number, yMin: number, yMax: number): void {
    this.prevX = this.x;
    this.prevY = this.y;

    // Longitudinal : croisière, bridée par le véhicule de devant.
    const target = Math.min(this.cruise, this.speedLimit);
    const speed = this.vx * this.dir;
    const rate = (target > speed ? config.scooterAccel : config.scooterDecel) * dt;
    const next = speed < target ? Math.min(speed + rate, target) : Math.max(speed - rate, target);
    this.vx = Math.max(0, next) * this.dir;

    // Latéral : rappel vers la position de confort + répulsion des voisins.
    let targetVy = (this.comfortY - this.y) * config.comfortGain + this.sepVy;
    if (targetVy > config.steerMax) targetVy = config.steerMax;
    else if (targetVy < -config.steerMax) targetVy = -config.steerMax;
    const latRate = config.scooterLatAccel * dt;
    this.vy = this.vy < targetVy ? Math.min(this.vy + latRate, targetVy) : Math.max(this.vy - latRate, targetVy);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y < yMin) {
      this.y = yMin;
      if (this.vy < 0) this.vy = 0;
    } else if (this.y > yMax) {
      this.y = yMax;
      if (this.vy > 0) this.vy = 0;
    }
  }
}

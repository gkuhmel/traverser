import { config } from './config';
import type { Rng } from './rng';
import { Scooter } from './scooter';

/** Nombre de couleurs de carrosserie (palette définie dans le rendu). */
export const SCOOTER_COLOR_COUNT = 8;

/** Gestion du flux : apparitions, séparation entre scooters, disparitions. */
export class Traffic {
  readonly scooters: Scooter[] = [];
  /** Débit courant (scooters/s). */
  spawnRate = config.spawnRateStart;
  /** Bonus de débit réglable depuis le debug (test de charge), hors plafond. */
  debugRateBonus = 0;
  private spawnTimer = 0;

  constructor(private readonly rng: Rng) {
    this.spawnTimer = this.nextInterval();
  }

  update(dt: number): void {
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer += this.nextInterval();
    }

    this.computeInteractions();

    const half = config.streetWidth / 2;
    const yLimit = half - config.scooterWidth / 2 - config.streetEdgeMargin;
    const list = this.scooters;
    for (const s of list) s.integrate(dt, -yLimit, yLimit);

    // Disparition hors écran (retrait par échange avec le dernier : pas d'allocation).
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (s.x * s.dir > config.despawnX) {
        list[i] = list[list.length - 1]!;
        list.pop();
      }
    }
  }

  /** Débit effectif, bonus de debug compris. */
  get effectiveRate(): number {
    return this.spawnRate + this.debugRateBonus;
  }

  /** Intervalle exponentiel (processus de Poisson) : flux irrégulier, jamais en grille. */
  private nextInterval(): number {
    const rate = Math.max(0.01, this.effectiveRate);
    return Math.max(config.spawnMinInterval, -Math.log(1 - this.rng.next()) / rate);
  }

  private spawn(): void {
    if (this.scooters.length >= config.maxScooters) return;
    const half = config.streetWidth / 2;
    const yLimit = half - config.scooterWidth / 2 - config.streetEdgeMargin - 0.3;

    const dir: 1 | -1 = config.twoWay && this.rng.next() < 0.5 ? -1 : 1;
    // En double sens, on roule à droite : vers la droite en bas (y > 0), vers la gauche en haut.
    const yMin = config.twoWay ? (dir > 0 ? 0.4 : -yLimit) : -yLimit;
    const yMax = config.twoWay ? (dir > 0 ? yLimit : -0.4) : yLimit;
    const x = config.spawnX * dir;

    // Quelques essais pour ne pas apparaître sur un autre scooter ; sinon on renonce.
    for (let attempt = 0; attempt < 8; attempt++) {
      const y = this.rng.range(yMin, yMax);
      if (this.isFree(x, y, dir)) {
        const s = new Scooter();
        s.dir = dir;
        s.x = s.prevX = x;
        s.y = s.prevY = y;
        s.comfortY = y;
        s.cruise = this.rng.range(config.scooterSpeedMin, config.scooterSpeedMax);
        s.vx = s.cruise * dir;
        s.colorIndex = this.rng.int(SCOOTER_COLOR_COUNT);
        this.scooters.push(s);
        return;
      }
    }
  }

  private isFree(x: number, y: number, dir: 1 | -1): boolean {
    const minDx = config.scooterLength + config.followGap;
    for (const o of this.scooters) {
      if (o.dir !== dir) continue;
      if (Math.abs(o.x - x) < minDx && Math.abs(o.y - y) < config.scooterWidth + 0.2) return false;
    }
    return true;
  }

  /** Séparation latérale douce et suivi longitudinal, calculés sur l'état courant (indépendant de l'ordre). */
  private computeInteractions(): void {
    const list = this.scooters;
    const n = list.length;
    const rx = config.sepRangeX;
    const ry = config.sepRangeY;
    const laneOverlap = config.scooterWidth + 0.25;
    const minGap = config.scooterLength + config.followGap;

    for (const s of list) {
      s.sepVy = 0;
      s.speedLimit = Infinity;
    }

    for (let i = 0; i < n; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = list[j]!;
        const dx = b.x - a.x;
        if (dx > rx + minGap || dx < -rx - minGap) continue;
        const dy = b.y - a.y;
        const ady = Math.abs(dy);
        if (ady >= ry) continue;

        // Répulsion latérale, plus forte quand ils sont proches dans les deux axes.
        const adx = Math.abs(dx);
        if (adx < rx) {
          const w = (1 - ady / ry) * (1 - adx / rx) * config.sepStrength;
          const sign = dy !== 0 ? Math.sign(dy) : i < j ? 1 : -1;
          a.sepVy -= sign * w;
          b.sepVy += sign * w;
        }

        // Suivi : celui de derrière ne rentre pas dans celui de devant (même sens, voies qui se chevauchent).
        if (a.dir === b.dir && ady < laneOverlap) {
          const ahead = dx * a.dir > 0 ? b : a;
          const behind = ahead === b ? a : b;
          const gap = adx - minGap;
          const limit = Math.abs(ahead.vx) + gap * config.followGain;
          if (limit < behind.speedLimit) behind.speedLimit = limit;
        }
      }
    }
  }
}

import { config } from './config';
import type { Rng } from './rng';
import { Scooter, type PedPerception } from './scooter';

/** Nombre de couleurs de carrosserie (palette définie dans le rendu). */
export const SCOOTER_COLOR_COUNT = 8;

export type FlowKind = 'normal' | 'burst' | 'lull';

/** Gestion du flux : apparitions, séparation entre scooters, disparitions. */
export class Traffic {
  readonly scooters: Scooter[] = [];
  /** Débit courant (scooters/s). */
  spawnRate = config.spawnRateStart;
  /** Bonus de débit réglable depuis le debug (test de charge), hors plafond. */
  debugRateBonus = 0;

  /** Rafales et creux (§7) : multiplicateur du débit, constant par tronçon de durée aléatoire. */
  flow: FlowKind = 'normal';
  flowMultiplier = 1;
  private flowTimer = 0;

  /**
   * Apparitions en processus de Poisson à débit variable : on cumule « débit × dt » et on fait
   * apparaître un scooter chaque fois que le cumul dépasse un seuil exponentiel. Le flux reste
   * irrégulier même quand le débit change en cours de route.
   */
  private exposure = 0;
  private threshold = 1;
  private sinceSpawn = 0;

  constructor(private readonly rng: Rng) {
    this.threshold = this.nextThreshold();
    this.nextFlowSegment();
  }

  update(dt: number, time: number, ped: PedPerception): void {
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) this.nextFlowSegment();

    this.sinceSpawn += dt;
    this.exposure += this.currentRate * dt;
    if (this.exposure >= this.threshold && this.sinceSpawn >= config.spawnMinInterval) {
      this.exposure -= this.threshold;
      this.threshold = this.nextThreshold();
      this.sinceSpawn = 0;
      this.spawn();
    }

    this.computeInteractions();

    const half = config.streetWidth / 2;
    const yLimit = half - config.scooterWidth / 2 - config.streetEdgeMargin;
    const list = this.scooters;
    for (const s of list) s.think(dt, time, ped, yLimit);
    for (const s of list) s.integrate(dt, -yLimit, yLimit);
    this.resolveOverlaps(yLimit);

    // Disparition hors écran (retrait par échange avec le dernier : pas d'allocation).
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (s.x * s.dir > config.despawnX) {
        list[i] = list[list.length - 1]!;
        list.pop();
      }
    }
  }

  /** Débit moyen effectif, bonus de debug compris (scooters/s). */
  get effectiveRate(): number {
    return this.spawnRate + this.debugRateBonus;
  }

  /** Débit instantané, rafale ou creux compris (scooters/s). */
  get currentRate(): number {
    return this.effectiveRate * this.flowMultiplier;
  }

  private nextThreshold(): number {
    return -Math.log(1 - this.rng.next());
  }

  /** Tire le prochain tronçon : rafale, creux ou flux normal, pour une durée aléatoire. */
  private nextFlowSegment(): void {
    const r = this.rng.next();
    if (r < config.burstChance) {
      this.flow = 'burst';
      this.flowMultiplier = config.burstMultiplier;
    } else if (r < config.burstChance + config.lullChance) {
      this.flow = 'lull';
      this.flowMultiplier = config.lullMultiplier;
    } else {
      this.flow = 'normal';
      this.flowMultiplier = 1;
    }
    this.flowTimer = this.rng.range(config.flowSegmentMin, config.flowSegmentMax);
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
        s.decisionTimer = this.rng.next() * config.decisionInterval;
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

  /**
   * Contrainte dure : deux scooters ne se superposent jamais. Chaque paire qui se recouvre (marge comprise)
   * est séparée selon l'axe de moindre pénétration : latéralement s'ils sont côte à côte, sinon celui de
   * derrière est reculé et calé sur la vitesse de celui de devant.
   */
  private resolveOverlaps(yLimit: number): void {
    const list = this.scooters;
    const n = list.length;
    const minDx = config.scooterLength + config.scooterGapMin;
    const minDy = config.scooterWidth + config.scooterGapMin;
    for (let i = 0; i < n; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = list[j]!;
        const dx = b.x - a.x;
        const adx = Math.abs(dx);
        if (adx >= minDx) continue;
        const dy = b.y - a.y;
        const ady = Math.abs(dy);
        if (ady >= minDy) continue;

        const penX = (minDx - adx) / minDx;
        const penY = (minDy - ady) / minDy;
        if (penY <= penX || a.dir !== b.dir) {
          // Côte à côte : on écarte chacun de la moitié, sans sortir de la chaussée.
          const sign = dy !== 0 ? Math.sign(dy) : i < j ? 1 : -1;
          const push = (minDy - ady) / 2;
          a.y = Math.max(-yLimit, Math.min(yLimit, a.y - sign * push));
          b.y = Math.max(-yLimit, Math.min(yLimit, b.y + sign * push));
          if ((b.vy - a.vy) * sign < 0) {
            const mid = (a.vy + b.vy) / 2;
            a.vy = mid;
            b.vy = mid;
          }
        } else {
          // L'un derrière l'autre : celui de derrière recule et prend la vitesse de celui de devant.
          const ahead = dx * a.dir > 0 ? b : a;
          const behind = ahead === b ? a : b;
          behind.x = ahead.x - ahead.dir * minDx;
          if (Math.abs(behind.vx) > Math.abs(ahead.vx)) behind.vx = ahead.vx;
        }
      }
    }
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

import { config } from './config';
import type { Rng } from './rng';
import { Scooter, VEHICLE_KINDS, type PedPerception, type VehicleKind } from './scooter';

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
    this.updateOvertaking(dt, config.streetWidth / 2 - config.streetEdgeMargin);

    // Demi-largeur utilisable de la chaussée (m) ; chaque véhicule en retire sa propre demi-largeur.
    const roadHalf = config.streetWidth / 2 - config.streetEdgeMargin;
    const list = this.scooters;
    for (const s of list) s.think(dt, time, ped, roadHalf);
    for (const s of list) s.integrate(dt, roadHalf);
    this.resolveOverlaps(roadHalf);

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

  /** Tire un type de véhicule selon les parts `weight` de config.vehicles. */
  private pickKind(): VehicleKind {
    let total = 0;
    for (const k of VEHICLE_KINDS) total += Math.max(0, config.vehicles[k].weight);
    let r = this.rng.next() * total;
    for (const k of VEHICLE_KINDS) {
      r -= Math.max(0, config.vehicles[k].weight);
      if (r < 0) return k;
    }
    return 'scooter';
  }

  private spawn(): void {
    if (this.scooters.length >= config.maxScooters) return;
    const kind = this.pickKind();
    const type = config.vehicles[kind];
    const yLimit = config.streetWidth / 2 - config.streetEdgeMargin - type.width / 2 - 0.3;

    const dir: 1 | -1 = config.twoWay && this.rng.next() < 0.5 ? -1 : 1;
    // En double sens, on roule à droite : vers la droite en bas (y > 0), vers la gauche en haut.
    const yMin = config.twoWay ? (dir > 0 ? 0.4 + type.width / 2 : -yLimit) : -yLimit;
    const yMax = config.twoWay ? (dir > 0 ? yLimit : -0.4 - type.width / 2) : yLimit;
    // Apparition hors écran : l'arrière du véhicule à spawnX, quelle que soit sa longueur.
    const x = (config.spawnX - type.length / 2) * dir;

    // Quelques essais pour ne pas apparaître sur un autre véhicule ; sinon on renonce.
    for (let attempt = 0; attempt < 8; attempt++) {
      const y = this.rng.range(yMin, yMax);
      if (this.isFree(x, y, dir, type.length, type.width)) {
        const s = new Scooter();
        s.kind = kind;
        s.length = type.length;
        s.width = type.width;
        s.cornerRadius = type.cornerRadius;
        s.dir = dir;
        s.x = s.prevX = x;
        s.y = s.prevY = y;
        s.comfortY = y;
        s.cruise = this.rng.range(type.speedMin, type.speedMax);
        s.vx = s.cruise * dir;
        s.colorIndex = this.rng.int(SCOOTER_COLOR_COUNT);
        s.decisionTimer = this.rng.next() * config.decisionInterval;
        this.scooters.push(s);
        return;
      }
    }
  }

  private isFree(x: number, y: number, dir: 1 | -1, length: number, width: number): boolean {
    for (const o of this.scooters) {
      if (o.dir !== dir) continue;
      const minDx = (o.length + length) / 2 + config.followGap;
      const minDy = (o.width + width) / 2 + 0.2;
      if (Math.abs(o.x - x) < minDx && Math.abs(o.y - y) < minDy) return false;
    }
    return true;
  }

  /**
   * Contrainte dure : deux scooters ne se superposent jamais. Chaque paire qui se recouvre (marge comprise)
   * est séparée selon l'axe de moindre pénétration : latéralement s'ils sont côte à côte, sinon celui de
   * derrière est reculé et calé sur la vitesse de celui de devant.
   */
  private resolveOverlaps(roadHalf: number): void {
    const list = this.scooters;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = list[j]!;
        const minDx = (a.length + b.length) / 2 + config.scooterGapMin;
        const minDy = (a.width + b.width) / 2 + config.scooterGapMin;
        const dx = b.x - a.x;
        const adx = Math.abs(dx);
        if (adx >= minDx) continue;
        const dy = b.y - a.y;
        const ady = Math.abs(dy);
        if (ady >= minDy) continue;

        const penX = (minDx - adx) / minDx;
        const penY = (minDy - ady) / minDy;
        if (penY <= penX || a.dir !== b.dir) {
          // Côte à côte : on les écarte, le plus lourd bougeant le moins, sans sortir de la chaussée.
          const sign = dy !== 0 ? Math.sign(dy) : i < j ? 1 : -1;
          const push = minDy - ady;
          const ma = a.type.mass;
          const mb = b.type.mass;
          const limA = roadHalf - a.width / 2;
          const limB = roadHalf - b.width / 2;
          a.y = Math.max(-limA, Math.min(limA, a.y - sign * push * (mb / (ma + mb))));
          b.y = Math.max(-limB, Math.min(limB, b.y + sign * push * (ma / (ma + mb))));
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

  /**
   * Dépassement : un véhicule bridé par un plus lent déboîte du côté libre (nouvelle position de confort),
   * plutôt que de faire la queue. Sans cela, vélos et camions créent des bouchons où le flux s'arrête.
   */
  private updateOvertaking(dt: number, roadHalf: number): void {
    for (const s of this.scooters) {
      const leader = s.leader;
      if (!leader || s.side !== 0 || s.speedLimit > s.cruise - config.overtakeDeficit) {
        s.blockedTime = Math.max(0, s.blockedTime - dt);
        continue;
      }
      s.blockedTime += dt;
      if (s.blockedTime < config.overtakeDelay) continue;

      const offset = (leader.width + s.width) / 2 + config.overtakeMargin;
      const lim = roadHalf - s.width / 2;
      const up = leader.y - offset;
      const down = leader.y + offset;
      const upOk = up >= -lim && this.laneFree(s, up);
      const downOk = down <= lim && this.laneFree(s, down);
      if (!upOk && !downOk) continue;
      const pick = upOk && downOk ? (Math.abs(up - s.y) <= Math.abs(down - s.y) ? up : down) : upOk ? up : down;
      s.comfortY = pick;
      s.blockedTime = 0;
    }
  }

  /** La bande d'ordonnée y est-elle libre autour de s (quelques mètres devant et derrière) ? */
  private laneFree(s: Scooter, y: number): boolean {
    for (const o of this.scooters) {
      if (o === s) continue;
      const dx = (o.x - s.x) * s.dir;
      if (dx < -s.length - 1 || dx > s.length + 5) continue;
      if (Math.abs(o.y - y) < (o.width + s.width) / 2 + 0.2) return false;
    }
    return true;
  }

  /** Séparation latérale douce et suivi longitudinal, calculés sur l'état courant (indépendant de l'ordre). */
  private computeInteractions(): void {
    const list = this.scooters;
    const n = list.length;
    for (const s of list) {
      s.sepVy = 0;
      s.speedLimit = Infinity;
      s.leader = null;
    }

    for (let i = 0; i < n; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = list[j]!;
        // Portées dépendant des gabarits des deux véhicules.
        const rx = (a.length + b.length) / 2 + config.sepMarginX;
        const ry = (a.width + b.width) / 2 + config.sepMarginY;
        const minGap = (a.length + b.length) / 2 + config.followGap;
        const laneOverlap = (a.width + b.width) / 2 + 0.25;
        const dx = b.x - a.x;
        if (dx > rx + minGap || dx < -rx - minGap) continue;
        const dy = b.y - a.y;
        const ady = Math.abs(dy);
        if (ady >= ry) continue;

        // Répulsion latérale, plus forte quand ils sont proches ; le plus lourd est moins repoussé.
        const adx = Math.abs(dx);
        if (adx < rx) {
          const w = (1 - ady / ry) * (1 - adx / rx) * config.sepStrength;
          const sign = dy !== 0 ? Math.sign(dy) : i < j ? 1 : -1;
          const ma = a.type.mass;
          const mb = b.type.mass;
          a.sepVy -= sign * w * ((2 * mb) / (ma + mb));
          b.sepVy += sign * w * ((2 * ma) / (ma + mb));
        }

        // Suivi : celui de derrière ne rentre pas dans celui de devant (même sens, voies qui se chevauchent).
        if (a.dir === b.dir && ady < laneOverlap) {
          const ahead = dx * a.dir > 0 ? b : a;
          const behind = ahead === b ? a : b;
          const gap = adx - minGap;
          const limit = Math.abs(ahead.vx) + gap * config.followGain;
          if (limit < behind.speedLimit) {
            behind.speedLimit = limit;
            behind.leader = ahead;
          }
        }
      }
    }

    // La répulsion cumulée de plusieurs voisins reste plafonnée : un véhicule entouré ne doit pas
    // être projeté latéralement (ni poussé vers le piéton qu'il contourne).
    for (const s of list) {
      if (s.sepVy > config.sepStrength) s.sepVy = config.sepStrength;
      else if (s.sepVy < -config.sepStrength) s.sepVy = -config.sepStrength;
    }
  }
}

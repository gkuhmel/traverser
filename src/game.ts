import type { Camera } from './camera';
import { config } from './config';
import type { Input } from './input';
import { Pedestrian } from './pedestrian';
import { Rng } from './rng';
import { scooterGap, type PedPerception } from './scooter';
import { loadBest, saveBest } from './storage';
import { Traffic } from './traffic';

/** Phases d'une partie. */
export type Phase = 'playing' | 'hit' | 'over';

/** Effet visuel de frôlement (§6). */
export interface NearMissFx {
  x: number;
  y: number;
  /** Sens de passage du scooter (+1 vers la droite). */
  dir: 1 | -1;
  age: number;
}

/** État de partie : piéton, trafic, traversées, densité, collision et fin de partie. */
export class Game {
  /** Temps de simulation écoulé (s). */
  time = 0;
  phase: Phase = 'playing';
  /** Temps passé dans la phase courante (s). */
  phaseTime = 0;

  ped = new Pedestrian();
  /** Nombre de traversées réussies. */
  crossings = 0;
  /** Nombre de frôlements (scooter passé à moins de nearMissDistance sans contact). */
  nearMisses = 0;
  /** Meilleur score sauvegardé, et record battu pendant cette partie ? */
  best = loadBest();
  newRecord = false;
  /**
   * Le piéton a-t-il le droit d'avancer ? Repasse à false à chaque arrivée :
   * il faut relever puis reposer le doigt pour repartir.
   */
  canWalk = false;

  /** Debug : collisions ignorées (mais comptées). */
  invincible = false;
  /** Contacts survenus en mode invincible. */
  ghostHits = 0;

  /** Graine de la partie (affichée en debug pour rejouer une situation). */
  seed: number;
  rng: Rng;
  traffic: Traffic;
  /** Temps de jeu (s), compté à partir du premier appui. */
  playTime = 0;
  started = false;
  /** Palier de densité courant (1, 2, 3…). */
  densityLevel = 1;
  /** Temps de simulation du dernier changement de palier (s), pour signaler la montée à l'écran. */
  densityChangedAt = -Infinity;

  /** Ce que les scooters perçoivent du piéton : vitesse lissée avec retard (§5.2). */
  readonly perception: PedPerception = { x: 0, y: 0, vx: 0, vy: 0, radius: config.pedRadius };
  /** Effets de frôlement en cours. */
  readonly nearMissFx: NearMissFx[] = [];
  /** Scooter qui a percuté le piéton (pour le rendu). */
  hitBy: object | null = null;

  constructor(
    private readonly input: Input,
    private readonly camera: Camera,
    seed?: number,
  ) {
    this.seed = 0;
    this.rng = new Rng(0);
    this.traffic = new Traffic(this.rng);
    this.reset(seed);
  }

  /** Nouvelle partie : piéton au départ, trafic neuf (rue préremplie), compteurs à zéro. */
  reset(seed?: number): void {
    this.seed = (seed ?? Date.now() ^ 0x5bd1e995) >>> 0;
    this.rng = new Rng(this.seed);
    this.traffic = new Traffic(this.rng);
    this.ped = new Pedestrian();
    this.phase = 'playing';
    this.phaseTime = 0;
    this.crossings = 0;
    this.nearMisses = 0;
    this.newRecord = false;
    this.canWalk = false;
    this.ghostHits = 0;
    this.playTime = 0;
    this.started = false;
    this.densityLevel = 1;
    this.densityChangedAt = -Infinity;
    this.hitBy = null;
    this.nearMissFx.length = 0;
    this.perception.vx = this.perception.vy = 0;
    this.updatePerception(config.fixedDt);
    for (let t = 0; t < config.trafficPrewarm; t += config.fixedDt) {
      this.traffic.update(config.fixedDt, this.time - config.trafficPrewarm + t, this.perception);
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
    this.phaseTime += dt;
    this.updateFx(dt);

    if (this.phase === 'hit') {
      // Arrêt du temps : on vide les appuis, puis écran de fin.
      while (this.input.consumePress()) {
        // ignoré pendant l'arrêt sur image
      }
      if (this.phaseTime >= config.hitStopDuration) this.enterPhase('over');
      return;
    }

    if (this.phase === 'over') {
      // « Toucher pour rejouer », après un court délai pour éviter un appui involontaire.
      let pressed = false;
      while (this.input.consumePress()) pressed = true;
      if (pressed && this.phaseTime >= config.replayDelay) this.reset();
      return;
    }

    this.updatePlaying(dt);
  }

  private updatePlaying(dt: number): void {
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
    const level = 1 + Math.floor(this.playTime / config.densityInterval);
    if (level !== this.densityLevel) {
      this.densityLevel = level;
      this.densityChangedAt = this.time;
    }
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

    this.checkContacts();
  }

  /** Collision (écart < 0) et frôlements (écart min < nearMissDistance, sans contact, une fois passé). */
  private checkContacts(): void {
    const p = this.ped;
    const r = config.pedRadius;
    const passReach = config.scooterLength / 2 + r;
    for (const s of this.traffic.scooters) {
      const ahead = (p.x - s.x) * s.dir;
      if (ahead > config.scooterLength + 2 || s.pedPassed) continue;

      const gap = scooterGap(s, p.x, p.y, r);
      if (gap < s.minPedGap) s.minPedGap = gap;

      if (gap < 0 && !s.pedTouched) {
        s.pedTouched = true;
        if (this.invincible) this.ghostHits++;
        else {
          this.hitBy = s;
          this.enterPhase('hit');
          return;
        }
      }

      if (ahead < -passReach) {
        s.pedPassed = true;
        if (!s.pedTouched && s.minPedGap < config.nearMissDistance) {
          this.nearMisses++;
          this.nearMissFx.push({ x: p.x, y: s.y, dir: s.dir, age: 0 });
        }
      }
    }
  }

  private enterPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
    if (phase === 'over') {
      if (this.crossings > this.best) {
        this.best = this.crossings;
        this.newRecord = true;
        saveBest(this.best);
      }
      while (this.input.consumePress()) {
        // les appuis antérieurs ne relancent pas la partie
      }
    }
  }

  private updateFx(dt: number): void {
    const fx = this.nearMissFx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]!;
      f.age += dt;
      if (f.age > config.nearMissFxDuration) fx.splice(i, 1);
    }
  }
}

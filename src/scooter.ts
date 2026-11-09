import { config } from './config';

/** Ce que les scooters savent du piéton : position exacte, vitesse lissée avec retard (§5.2). */
export interface PedPerception {
  x: number;
  y: number;
  /** Vitesse perçue (EMA de la vitesse réelle, constante de temps perceptionLag). */
  vx: number;
  vy: number;
  radius: number;
  /** Piéton remarqué (il court) : les conducteurs s'engagent moins longtemps et s'ajustent en continu. */
  attentive: boolean;
}

/** État de l'IA, utilisé par le comportement et affiché en debug. */
export const AiState = {
  /** Piéton hors de portée ou déjà dépassé. */
  Idle: 0,
  /** Piéton surveillé, pas de conflit prédit. */
  Watching: 1,
  /** Contournement engagé sur un côté. */
  Avoiding: 2,
  /** Urgence : écart réel sous panicDistance, réévaluation libre. */
  Panic: 3,
} as const;
export type AiState = (typeof AiState)[keyof typeof AiState];

/** Types de véhicules disponibles (paramètres dans config.vehicles). */
export type VehicleKind = keyof typeof config.vehicles;
export const VEHICLE_KINDS = Object.keys(config.vehicles) as VehicleKind[];

/**
 * Un véhicule du flux : scooter, vélo, tuk-tuk ou petit camion (le nom de classe vient de la spec).
 * Position = centre du véhicule (m). `dir` = +1 : roule vers la droite ; -1 : vers la gauche (double sens).
 */
export class Scooter {
  kind: VehicleKind = 'scooter';
  /** Gabarit (m), fixé à l'apparition. */
  length = 1.8;
  width = 0.7;
  cornerRadius = 0.35;

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

  /** Paramètres du type (lus en direct : les curseurs de debug s'appliquent immédiatement). */
  get type(): (typeof config.vehicles)[VehicleKind] {
    return config.vehicles[this.kind];
  }
  get steerMax(): number {
    return config.steerMax * this.type.steerFactor;
  }
  get latAccel(): number {
    return config.scooterLatAccel * this.type.latAccelFactor;
  }
  get decel(): number {
    return config.scooterDecel * this.type.decelFactor;
  }
  /** Ralentissement max en fraction de la croisière (jamais l'arrêt complet). */
  get brakeMax(): number {
    return Math.min(0.85, config.brakeMax * this.type.brakeMaxFactor);
  }

  /** Consignes calculées par le trafic à chaque pas (séparation, suivi). */
  sepVy = 0;
  speedLimit = Infinity;
  /** Véhicule de devant qui bride celui-ci (suivi), et durée du blocage (dépassement). */
  leader: Scooter | null = null;
  blockedTime = 0;

  // --- IA d'évitement ---
  ai: AiState = AiState.Idle;
  /** Compte à rebours jusqu'à la prochaine décision (s), déphasé entre scooters. */
  decisionTimer = 0;
  /** Côté de contournement : +1 = passer côté y croissant, -1 = côté y décroissant, 0 = aucun. */
  side: -1 | 0 | 1 = 0;
  /** Le côté choisi est-il « derrière » le piéton (d'où il vient) ? */
  sideIsBehind = false;
  /** Début et fin de l'engagement sur le côté (temps de simulation, s). */
  commitStart = 0;
  commitUntil = 0;
  /** Ordonnée visée pour contourner (m). */
  avoidY = 0;
  /** Vitesse max imposée par l'évitement (m/s). */
  avoidSpeed = Infinity;
  /** Suivi du passage près du piéton : écart minimal, contact, piéton dépassé (frôlements, §6). */
  minPedGap = Infinity;
  pedTouched = false;
  pedPassed = false;

  /** Position prédite du piéton au moment du croisement (debug : point fantôme). */
  ghostX = 0;
  ghostY = 0;

  /**
   * Décision d'évitement (§5.3), appelée à chaque pas mais ne décide que tous les decisionInterval.
   * Une fois engagé, le plan est figé pendant commitTime : seule une urgence (écart réel < panicDistance)
   * déclenche une nouvelle décision. `time` = temps de simulation (s).
   */
  think(dt: number, time: number, ped: PedPerception, roadHalf: number): void {
    const L = this.length;
    const halfW = this.width / 2;
    const yLimit = roadHalf - halfW;
    const r = ped.radius;

    // Distance longitudinale devant le scooter (m) : > 0 si le piéton est devant.
    const ahead = (ped.x - this.x) * this.dir;
    const passReach = L / 2 + r;

    // Piéton dépassé ou trop loin : on relâche tout.
    if (ahead < -passReach - 0.3 || ahead > config.awarenessRange) {
      this.clearAvoid();
      this.ai = AiState.Idle;
      return;
    }

    // Urgence (vérifiée à chaque pas) : écart réel trop faible → l'engagement saute.
    const panic = scooterGap(this, ped.x, ped.y, r) < config.panicDistance;

    // 4. Engagement : pendant commitTime, le plan (côté, trajectoire, vitesse) est figé, sauf urgence.
    const commitEnd = ped.attentive
      ? Math.min(this.commitUntil, this.commitStart + config.sprintCommitTime)
      : this.commitUntil;
    const committed = this.side !== 0 && time < commitEnd;
    if (committed && !panic) {
      this.ai = AiState.Avoiding;
      return;
    }

    this.decisionTimer -= dt;
    if (this.decisionTimer > 0 && !panic) return;
    if (this.decisionTimer <= 0) this.decisionTimer += config.decisionInterval;

    // 1–2. Prédiction à vitesse courante : y a-t-il croisement dans l'horizon ?
    const speed = Math.abs(this.vx);
    const pedVxRel = ped.vx * this.dir;
    const H = config.predictionHorizon * this.type.horizonFactor;
    const tEnterNow = Math.max(0, (ahead - passReach) / Math.max(0.5, speed - pedVxRel));
    const tMid = Math.max(0, ahead / Math.max(0.5, speed - pedVxRel));
    this.ghostX = ped.x + ped.vx * Math.min(tMid, H);
    this.ghostY = ped.y + ped.vy * Math.min(tMid, H);

    if (tEnterNow > H) {
      // Croisement au-delà de l'horizon : on surveille seulement.
      this.clearAvoid();
      this.ai = AiState.Watching;
      return;
    }

    // 3. Conflit ? Trajectoire rectiligne du scooter contre la bande balayée par le piéton.
    const clearance = config.safeDistance + halfW + r;
    // Vitesse vers laquelle le véhicule tend sans intervention (croisière, bridée par celui de devant).
    const natural = Math.max(this.cruise * (1 - this.brakeMax), Math.min(this.cruise, this.speedLimit));
    const now = this.window(speed, natural, ahead, passReach, ped);
    const conflict = this.y > now.yLow - clearance && this.y < now.yHigh + clearance;
    if (!conflict && !panic) {
      this.clearAvoid();
      this.ai = AiState.Watching;
      return;
    }

    // Options : côté (+1 = y croissant, -1 = y décroissant) × niveau de freinage.
    // Freiner décale le croisement dans le temps : le piéton a avancé, la déviation nécessaire change.
    // « Derrière » = côté d'où vient le piéton, opposé à sa vitesse perçue.
    const behind: -1 | 0 | 1 = ped.vy < -0.05 ? 1 : ped.vy > 0.05 ? -1 : 0;
    const best = { plus: NO_OPTION(), minus: NO_OPTION() };
    const steps = Math.max(2, Math.round(config.brakeSteps));
    for (let k = 0; k < steps; k++) {
      const factor = 1 - (this.brakeMax * k) / (steps - 1);
      // Vitesse visée, sans dépasser ce qu'autorise le véhicule de devant (bornée au freinage max :
      // la limite de suivi peut être nulle ou négative dans un bouchon).
      const v = Math.max(this.cruise * (1 - this.brakeMax), Math.min(this.cruise * factor, this.speedLimit));
      // Chaque option est une vitesse cible : on modélise la transition (accélération ou freinage).
      const w = this.window(speed, v, ahead, passReach, ped);
      const reach = lateralReach(w.tEnter, this.vy, this.steerMax, this.latAccel);
      const brakeCost = config.brakeCost * this.type.brakeCostFactor * (1 - factor);
      for (const sd of [1, -1] as const) {
        const raw = sd > 0 ? w.yHigh + clearance : w.yLow - clearance;
        const target = Math.max(-yLimit, Math.min(yLimit, raw));
        const dev = Math.abs(target - this.y);
        // Manque d'écart si la bordure empêche d'atteindre la cible + manque de temps pour dévier.
        const shortfall = Math.abs(raw - target) + Math.max(0, dev - reach);
        const cost = dev + brakeCost + shortfall * config.shortfallPenalty;
        const o = sd > 0 ? best.plus : best.minus;
        if (cost < o.cost) {
          o.cost = cost;
          o.target = target;
          o.speed = k === 0 ? Infinity : this.cruise * factor;
        }
      }
    }

    // Côté le moins coûteux ; quasi-égalité → derrière (comportement réaliste).
    let side: -1 | 1;
    if (behind !== 0) {
      const cb = behind > 0 ? best.plus : best.minus;
      const cf = behind > 0 ? best.minus : best.plus;
      side = cb.cost <= cf.cost + config.sideTieMargin ? behind : (-behind as -1 | 1);
    } else side = best.plus.cost <= best.minus.cost ? 1 : -1;

    // 4. Engagement pour commitTime (une urgence ne fait que replanifier, l'engagement repart).
    this.commitStart = time;
    this.commitUntil = time + config.commitTime;
    this.side = side;
    this.sideIsBehind = side === behind;

    // 5. Exécution : cible latérale et vitesse du plan retenu.
    const chosen = side > 0 ? best.plus : best.minus;
    this.avoidY = chosen.target;
    this.avoidSpeed = chosen.speed;
    this.ai = panic ? AiState.Panic : AiState.Avoiding;
  }

  /**
   * Fenêtre de croisement si le véhicule passe de la vitesse `from` à `to` (accélération ou freinage
   * selon son type) : instant d'entrée de la capsule à l'abscisse du piéton et ordonnées extrêmes
   * du piéton prédit pendant le passage.
   */
  private window(from: number, to: number, ahead: number, passReach: number, ped: PedPerception): CrossWindow {
    const pedVxRel = ped.vx * this.dir;
    const rate = to >= from ? config.scooterAccel * this.type.accelFactor : this.decel;
    const tr = Math.abs(to - from) / rate;
    const dr = ((from + to) / 2 - pedVxRel) * tr;
    const tAt = (dist: number): number => {
      if (dist <= 0) return 0;
      // Phase de transition (vitesse linéaire) puis vitesse constante, relativement au piéton.
      if (dr >= dist) {
        // Résolution exacte dans la phase de transition : dist = (v0 - vp) t + a t² / 2.
        const v0 = from - pedVxRel;
        const a = (to - from) / Math.max(tr, 1e-6);
        if (Math.abs(a) < 1e-6) return dist / Math.max(0.5, v0);
        const disc = v0 * v0 + 2 * a * dist;
        if (disc <= 0) return tr;
        return Math.max(0, (-v0 + Math.sqrt(disc)) / a);
      }
      return tr + (dist - dr) / Math.max(0.5, to - pedVxRel);
    };
    // Prédiction bornée : au-delà de deux horizons, l'extrapolation n'a plus de sens.
    const tMax = 2 * config.predictionHorizon * this.type.horizonFactor;
    const tEnter = Math.min(tMax, tAt(ahead - passReach));
    const tExit = Math.min(tMax, tAt(ahead + passReach));
    const yEnter = ped.y + ped.vy * tEnter;
    const yExit = ped.y + ped.vy * tExit;
    return { tEnter, yLow: Math.min(yEnter, yExit), yHigh: Math.max(yEnter, yExit) };
  }

  private clearAvoid(): void {
    this.side = 0;
    this.commitUntil = 0;
    this.avoidSpeed = Infinity;
  }

  /** Avance d'un pas : vitesse vers la consigne, latéral vers le confort (ou l'évitement) + séparation. */
  integrate(dt: number, roadHalf: number): void {
    const yMax = roadHalf - this.width / 2;
    const yMin = -yMax;
    this.prevX = this.x;
    this.prevY = this.y;

    const avoiding = this.side !== 0;

    // Longitudinal : croisière, bridée par le véhicule de devant et par l'évitement.
    const target = Math.min(this.cruise, this.speedLimit, this.avoidSpeed);
    const speed = this.vx * this.dir;
    const rate = (target > speed ? config.scooterAccel * this.type.accelFactor : this.decel) * dt;
    const next = speed < target ? Math.min(speed + rate, target) : Math.max(speed - rate, target);
    this.vx = Math.max(0, next) * this.dir;

    // Latéral : évitement prioritaire, sinon rappel vers la position de confort ; plus répulsion des voisins.
    let targetVy = avoiding
      ? (this.avoidY - this.y) * config.avoidGain + this.sepVy * config.avoidSepFactor
      : (this.comfortY - this.y) * config.comfortGain + this.sepVy;
    const steer = this.steerMax;
    if (targetVy > steer) targetVy = steer;
    else if (targetVy < -steer) targetVy = -steer;
    const latRate = this.latAccel * dt;
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

interface CrossWindow {
  tEnter: number;
  yLow: number;
  yHigh: number;
}

interface AvoidOption {
  cost: number;
  target: number;
  speed: number;
}

const NO_OPTION = (): AvoidOption => ({ cost: Infinity, target: 0, speed: Infinity });

/** Déplacement latéral atteignable en `t` secondes (m), partant de la vitesse latérale vy0, plafonné par `steer`. */
function lateralReach(t: number, vy0: number, steer: number, latAccel: number): number {
  const ramp = Math.max(0, steer - Math.abs(vy0) * 0.5) / latAccel;
  return Math.max(0, steer * (t - ramp / 2));
}

/**
 * Écart réel (m) entre le bord d'un cercle (centre px, py, rayon r) et le bord du véhicule,
 * modélisé en rectangle aux coins arrondis (capsule pour un scooter), aligné sur l'axe de la rue.
 * Négatif = contact.
 */
export function scooterGap(s: Scooter, px: number, py: number, r: number): number {
  const rc = Math.min(s.cornerRadius, s.width / 2);
  const dx = Math.max(Math.abs(px - s.x) - (s.length / 2 - rc), 0);
  const dy = Math.max(Math.abs(py - s.y) - (s.width / 2 - rc), 0);
  return Math.hypot(dx, dy) - rc - r;
}

/**
 * Repousse un cercle hors d'un véhicule (contact à faible vitesse : le piéton est bloqué, pas renversé).
 * Renvoie la nouvelle position du centre.
 */
export function pushOutOf(s: Scooter, px: number, py: number, r: number): { x: number; y: number } {
  const rc = Math.min(s.cornerRadius, s.width / 2);
  const hx = s.length / 2 - rc;
  const hy = s.width / 2 - rc;
  const cx = Math.max(s.x - hx, Math.min(s.x + hx, px));
  const cy = Math.max(s.y - hy, Math.min(s.y + hy, py));
  let nx = px - cx;
  let ny = py - cy;
  let d = Math.hypot(nx, ny);
  if (d < 1e-6) {
    // Centre à l'intérieur du noyau : on sort par le côté le plus proche (en y, vers le piéton).
    nx = 0;
    ny = py >= s.y ? 1 : -1;
    d = 1;
    return { x: px, y: s.y + ny * (s.width / 2 + r + 0.01) };
  }
  const k = (rc + r + 0.01) / d;
  return { x: cx + nx * k, y: cy + ny * k };
}

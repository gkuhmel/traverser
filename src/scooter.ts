import { config } from './config';

/** Ce que les scooters savent du piéton : position exacte, vitesse lissée avec retard (§5.2). */
export interface PedPerception {
  x: number;
  y: number;
  /** Vitesse perçue (EMA de la vitesse réelle, constante de temps perceptionLag). */
  vx: number;
  vy: number;
  radius: number;
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

/**
 * Un scooter. Position = centre de la capsule (m).
 * `dir` = +1 : roule vers la droite ; -1 : vers la gauche (double sens).
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

  // --- IA d'évitement ---
  ai: AiState = AiState.Idle;
  /** Compte à rebours jusqu'à la prochaine décision (s), déphasé entre scooters. */
  decisionTimer = 0;
  /** Côté de contournement : +1 = passer côté y croissant, -1 = côté y décroissant, 0 = aucun. */
  side: -1 | 0 | 1 = 0;
  /** Le côté choisi est-il « derrière » le piéton (d'où il vient) ? */
  sideIsBehind = false;
  /** Fin de l'engagement sur le côté (temps de simulation, s). */
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
  think(dt: number, time: number, ped: PedPerception, yLimit: number): void {
    const L = config.scooterLength;
    const halfW = config.scooterWidth / 2;
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
    const committed = this.side !== 0 && time < this.commitUntil;
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
    const H = config.predictionHorizon;
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
    const now = this.window(speed, speed, ahead, passReach, ped);
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
      const factor = 1 - (config.brakeMax * k) / (steps - 1);
      const v = this.cruise * factor;
      const w = k === 0 && v >= speed ? now : this.window(speed, Math.min(v, speed), ahead, passReach, ped);
      const reach = lateralReach(w.tEnter, this.vy);
      const brakeCost = config.brakeCost * (1 - factor);
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
          o.speed = k === 0 ? Infinity : v;
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
   * Fenêtre de croisement si le scooter passe de la vitesse `from` à `to` (freinage à scooterDecel) :
   * instants d'entrée/sortie de la capsule à l'abscisse du piéton et ordonnées extrêmes du piéton prédit.
   */
  private window(from: number, to: number, ahead: number, passReach: number, ped: PedPerception): CrossWindow {
    const pedVxRel = ped.vx * this.dir;
    const tAt = (dist: number): number => {
      if (dist <= 0) return 0;
      // Phase de freinage puis vitesse constante (relatif au piéton).
      const tb = Math.max(0, (from - to) / config.scooterDecel);
      const db = ((from + to) / 2 - pedVxRel) * tb;
      if (db >= dist) {
        const avg = Math.max(0.5, (from + to) / 2 - pedVxRel);
        return dist / avg;
      }
      return tb + (dist - db) / Math.max(0.5, to - pedVxRel);
    };
    const tEnter = tAt(ahead - passReach);
    const tExit = tAt(ahead + passReach);
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
  integrate(dt: number, yMin: number, yMax: number): void {
    this.prevX = this.x;
    this.prevY = this.y;

    const avoiding = this.side !== 0;

    // Longitudinal : croisière, bridée par le véhicule de devant et par l'évitement.
    const target = Math.min(this.cruise, this.speedLimit, this.avoidSpeed);
    const speed = this.vx * this.dir;
    const rate = (target > speed ? config.scooterAccel : config.scooterDecel) * dt;
    const next = speed < target ? Math.min(speed + rate, target) : Math.max(speed - rate, target);
    this.vx = Math.max(0, next) * this.dir;

    // Latéral : évitement prioritaire, sinon rappel vers la position de confort ; plus répulsion des voisins.
    let targetVy = avoiding
      ? (this.avoidY - this.y) * config.avoidGain + this.sepVy * config.avoidSepFactor
      : (this.comfortY - this.y) * config.comfortGain + this.sepVy;
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

/** Déplacement latéral atteignable en `t` secondes (m), partant de la vitesse latérale vy0, plafonné par steerMax. */
function lateralReach(t: number, vy0: number): number {
  const ramp = Math.max(0, config.steerMax - Math.abs(vy0) * 0.5) / config.scooterLatAccel;
  return Math.max(0, config.steerMax * (t - ramp / 2));
}

/**
 * Écart réel (m) entre le bord d'un cercle (centre px, py, rayon r) et le bord de la capsule du scooter.
 * Négatif = contact. Capsule approchée comme alignée sur l'axe de la rue.
 */
export function scooterGap(s: Scooter, px: number, py: number, r: number): number {
  const halfW = config.scooterWidth / 2;
  const halfSeg = config.scooterLength / 2 - halfW;
  const dx = Math.max(Math.abs(px - s.x) - halfSeg, 0);
  const dy = py - s.y;
  return Math.hypot(dx, dy) - halfW - r;
}

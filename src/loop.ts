import { config } from './config';

export interface LoopStats {
  /** Nombre de pas de simulation exécutés lors de la dernière frame. */
  stepsLastFrame: number;
  /** Durée réelle de la dernière frame (s). */
  frameTime: number;
  /** Mesure du coût CPU, activée uniquement par le panneau de debug. */
  measure: boolean;
  /** Temps passé dans la simulation / le rendu lors de la dernière frame (ms). */
  updateMs: number;
  renderMs: number;
}

/**
 * Boucle à pas de temps fixe avec rendu interpolé.
 * `update` reçoit toujours `config.fixedDt` : la simulation ne dépend pas du framerate.
 * `render` reçoit `alpha` ∈ [0,1[, la fraction de pas écoulée depuis le dernier update.
 */
export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number) => void,
  stats?: LoopStats,
): void {
  let last = -1;
  let acc = 0;

  const frame = (nowMs: number): void => {
    const now = nowMs / 1000;
    let frameTime = last < 0 ? 0 : now - last;
    last = now;
    if (frameTime > config.maxFrameTime) frameTime = config.maxFrameTime;

    acc += frameTime;
    const dt = config.fixedDt;
    let steps = 0;
    const measure = stats?.measure === true;
    const t0 = measure ? performance.now() : 0;
    while (acc >= dt) {
      update(dt);
      acc -= dt;
      steps++;
    }
    const t1 = measure ? performance.now() : 0;

    render(acc / dt);

    if (stats) {
      stats.stepsLastFrame = steps;
      stats.frameTime = frameTime;
      if (measure) {
        stats.updateMs = t1 - t0;
        stats.renderMs = performance.now() - t1;
      }
    }
    requestAnimationFrame(frame);
  };

  // Au retour d'arrière-plan, on repart sans rattraper le temps écoulé.
  document.addEventListener('visibilitychange', () => {
    last = -1;
    acc = 0;
  });

  requestAnimationFrame(frame);
}

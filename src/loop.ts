import { config } from './config';

export interface LoopStats {
  /** Nombre de pas de simulation exécutés lors de la dernière frame. */
  stepsLastFrame: number;
  /** Durée réelle de la dernière frame (s). */
  frameTime: number;
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
    while (acc >= dt) {
      update(dt);
      acc -= dt;
      steps++;
    }

    if (stats) {
      stats.stepsLastFrame = steps;
      stats.frameTime = frameTime;
    }

    render(acc / dt);
    requestAnimationFrame(frame);
  };

  // Au retour d'arrière-plan, on repart sans rattraper le temps écoulé.
  document.addEventListener('visibilitychange', () => {
    last = -1;
    acc = 0;
  });

  requestAnimationFrame(frame);
}

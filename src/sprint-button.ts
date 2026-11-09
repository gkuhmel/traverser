import { config } from './config';
import type { Game } from './game';
import type { Input } from './input';

/**
 * Bouton d'accélération (DOM, en bas à droite). Il reçoit ses propres Pointer Events : on peut
 * l'actionner avec un second doigt pendant que le premier fait marcher le piéton.
 * Anneau : plein = prêt ; se vide pendant l'accélération ; se remplit pendant la recharge.
 */
export class SprintButton {
  private readonly el: HTMLButtonElement;
  private lastKey = '';

  constructor(input: Input) {
    const el = document.createElement('button');
    el.setAttribute('aria-label', 'Accélérer');
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">' +
      '<path d="M6 13l6-6 6 6M6 19l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el.style.cssText =
      'position:fixed;right:calc(env(safe-area-inset-right,0px) + 18px);' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + 22px);width:76px;height:76px;border-radius:50%;' +
      'border:none;padding:6px;display:flex;align-items:center;justify-content:center;z-index:5;' +
      'touch-action:none;-webkit-tap-highlight-color:transparent;transition:opacity .2s,transform .08s;' +
      'box-shadow:0 3px 10px rgba(0,0,0,.35)';
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.requestSprint();
      el.style.transform = 'scale(0.92)';
    });
    const release = (): void => {
      el.style.transform = '';
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    document.body.appendChild(el);
    this.el = el;
  }

  /** Met à jour l'apparence (appelé à chaque frame ; ne touche au DOM que si l'état visible change). */
  update(game: Game): void {
    const visible = game.phase === 'playing';
    let state: 'ready' | 'active' | 'cooldown';
    let fill: number;
    if (game.sprintLeft > 0) {
      state = 'active';
      fill = game.sprintLeft / config.sprintDuration;
    } else if (game.sprintCooldownLeft > 0) {
      state = 'cooldown';
      fill = 1 - game.sprintCooldownLeft / config.sprintCooldown;
    } else {
      state = 'ready';
      fill = 1;
    }
    const pct = Math.round(fill * 100);
    const key = `${visible}|${state}|${pct}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const ring = state === 'active' ? '#ffd36b' : state === 'ready' ? '#f6c35b' : 'rgba(255,243,224,.55)';
    const inner = state === 'active' ? '#e0902c' : state === 'ready' ? '#3b2f27' : 'rgba(40,32,27,.85)';
    const icon = state === 'cooldown' ? 'rgba(255,243,224,.45)' : '#fff3e0';
    this.el.style.background =
      `radial-gradient(circle, ${inner} 0 60%, transparent 61%), ` +
      `conic-gradient(${ring} 0 ${pct}%, rgba(0,0,0,.35) ${pct}% 100%)`;
    this.el.style.color = icon;
    this.el.style.opacity = visible ? '1' : '0';
    this.el.style.pointerEvents = visible ? 'auto' : 'none';
  }
}

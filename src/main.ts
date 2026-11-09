import './style.css';
import { Camera } from './camera';
import { config } from './config';
import { Game } from './game';
import { Input } from './input';
import { startLoop, type LoopStats } from './loop';
import { Renderer } from './render';
import { SprintButton } from './sprint-button';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const input = new Input(canvas);
const game = new Game(input, camera);
const sprintButton = new SprintButton(input);

// Sonde CSS pour lire la marge de sécurité haute (encoche) : env() n'est pas accessible en JS.
const safeProbe = document.createElement('div');
safeProbe.style.cssText =
  'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
document.body.appendChild(safeProbe);

// --- Redimensionnement et DPR ---
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
  camera.resize(w, h);
  renderer.resize(w, h, dpr, safeProbe.getBoundingClientRect().height);
}
resize();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
// Safari met parfois à jour innerWidth/innerHeight après l'événement : on revérifie.
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// --- Debug (?debug=1), chargé uniquement à la demande ---
const stats: LoopStats = { stepsLastFrame: 0, frameTime: 0, measure: false, updateMs: 0, renderMs: 0 };
let onFrame: (() => void) | null = null;
let debugPanel: import('./debug').DebugPanel | null = null;
if (new URLSearchParams(location.search).get('debug') === '1') {
  void import('./debug').then(({ DebugPanel }) => {
    const panel = new DebugPanel(stats, camera, () => renderer.dpr, game);
    debugPanel = panel;
    onFrame = () => panel.frame();
    renderer.overlay = (ctx, alpha, px) => panel.drawOverlay(ctx, alpha, px);
    // Accès console pour inspecter l'état en debug.
    Object.assign(window, { game });
  });
}

startLoop(
  (dt) => {
    // En debug, la pause / le pas à pas filtrent les pas de simulation.
    if (debugPanel && !debugPanel.shouldUpdate()) return;
    game.update(dt);
  },
  (alpha) => {
    renderer.render(game, debugPanel?.paused ? 1 : alpha);
    sprintButton.update(game);
    onFrame?.();
  },
  stats,
);

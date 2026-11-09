import './style.css';
import { Camera } from './camera';
import { config } from './config';
import { Game } from './game';
import { Input } from './input';
import { startLoop, type LoopStats } from './loop';
import { Renderer } from './render';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const input = new Input(canvas);
const game = new Game(input, camera);

// --- Redimensionnement et DPR ---
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
  camera.resize(w, h);
  renderer.resize(w, h, dpr);
}
resize();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
// Safari met parfois à jour innerWidth/innerHeight après l'événement : on revérifie.
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// --- Debug (?debug=1), chargé uniquement à la demande ---
const stats: LoopStats = { stepsLastFrame: 0, frameTime: 0 };
let onFrame: (() => void) | null = null;
if (new URLSearchParams(location.search).get('debug') === '1') {
  void import('./debug').then(({ DebugPanel }) => {
    const panel = new DebugPanel(stats, camera, () => renderer.dpr);
    onFrame = () => panel.frame();
  });
}

startLoop(
  (dt) => game.update(dt),
  (alpha) => {
    renderer.render(game, alpha);
    onFrame?.();
  },
  stats,
);

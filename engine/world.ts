import { hl } from '@/lib/hl';

export interface World {
  root: HTMLElement;
  svg: SVGSVGElement;
  layers: { bg: SVGGElement; factories: SVGGElement; shelves: SVGGElement; fx: SVGGElement };
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D | null;
  /** CSS px size of the viewport */
  size(): { w: number; h: number };
  /** resize the particle canvas backing store (devicePixelRatio aware) */
  resize(): void;
  setTheme(theme: 'light' | 'dark'): void;
  setColor(mode: 'accent' | 'mono'): void;
  dispose(): void;
}

/**
 * Builds the world inside `root`: one full-viewport `<svg>` with layers bg → factories → shelves → fx,
 * and a pointer-events-none `<canvas>` above it for particles.
 */
export function createWorld(root: HTMLElement): World {
  const HL = hl();
  HL.inject(document);
  root.setAttribute('data-hairline', '');
  const svg = HL.mk('svg', { viewBox: '0 0 400 320', preserveAspectRatio: 'xMidYMid meet' }, root);
  const layer = (name: string) => HL.mk('g', { 'data-layer': name }, svg);
  const layers = { bg: layer('bg'), factories: layer('factories'), shelves: layer('shelves'), fx: layer('fx') };

  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-particles', '');
  root.appendChild(canvas);
  const ctx2d = canvas.getContext('2d');

  const size = () => ({ w: root.clientWidth || window.innerWidth, h: root.clientHeight || window.innerHeight });
  const resize = () => {
    const { w, h } = size();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx2d?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  return {
    root, svg, layers, canvas, ctx2d, size, resize,
    setTheme: (t) => root.setAttribute('data-hairline-theme', t),
    setColor: (m) => root.setAttribute('data-color', m),
    dispose: () => { svg.remove(); canvas.remove(); },
  };
}

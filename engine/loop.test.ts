import { describe, expect, it } from 'vitest';
import { createLoop, MAX_DT, type LoopEnv } from './loop';

function fakeEnv() {
  let cb: ((t: number) => void) | null = null;
  let hidden = false;
  const env: LoopEnv = { raf: (f) => { cb = f; return 1; }, caf: () => { cb = null; }, hidden: () => hidden };
  return {
    env,
    frame(t: number) { const f = cb; cb = null; f?.(t); },
    pending: () => cb !== null,
    hide(v: boolean) { hidden = v; },
  };
}

describe('createLoop', () => {
  it('first frame has dt 0, later dt in seconds clamped to MAX_DT, sim scaled', () => {
    const f = fakeEnv();
    const seen: [number, number][] = [];
    const loop = createLoop(() => 2, f.env);
    loop.add({ update: (sim, real) => { seen.push([sim, real]); return true; } });
    f.frame(1000); f.frame(1016); f.frame(5000);
    expect(seen[0]).toEqual([0, 0]);
    expect(seen[1][1]).toBeCloseTo(0.016, 6);
    expect(seen[1][0]).toBeCloseTo(0.032, 6);
    expect(seen[2][1]).toBe(MAX_DT);
  });
  it('sleeps when nothing is active or the tab is hidden; wake restarts with dt 0', () => {
    const f = fakeEnv();
    let active = true;
    const dts: number[] = [];
    const loop = createLoop(() => 1, f.env);
    loop.add({ update: (_s, real) => { dts.push(real); return active; } });
    f.frame(0); f.frame(16);
    active = false;
    f.frame(32);
    expect(f.pending()).toBe(false);
    active = true;
    loop.wake();
    f.frame(9000);
    expect(dts[dts.length - 1]).toBe(0);
    f.hide(true);
    f.frame(9016);
    expect(f.pending()).toBe(false);
  });
  it('dispose cancels', () => {
    const f = fakeEnv();
    const loop = createLoop(() => 1, f.env);
    loop.add({ update: () => true });
    loop.dispose();
    expect(f.pending()).toBe(false);
  });
});

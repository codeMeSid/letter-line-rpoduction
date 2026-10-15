/** A per-frame participant. Return true to keep the loop awake. */
export interface Subsystem {
  update(simDt: number, realDt: number, now: number): boolean | void;
}

export interface Loop {
  add(s: Subsystem): () => void;
  /** Restart after the loop slept (keypress, visibility change, settings change). */
  wake(): void;
  dispose(): void;
}

export interface LoopEnv {
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  hidden(): boolean;
}

export const MAX_DT = 0.1;

const browserEnv = (): LoopEnv => ({
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  hidden: () => document.hidden,
});

/** The single animation loop (Global Constraint). simDt = realDt × speedMul(now); realDt ≤ MAX_DT. */
export function createLoop(speedMul: (now: number) => number, env: LoopEnv = browserEnv()): Loop {
  const subs: Subsystem[] = [];
  let id: number | null = null;
  let last = -1;
  let disposed = false;
  const schedule = () => {
    if (id === null && !disposed) id = env.raf(frame);
  };
  function frame(now: number): void {
    id = null;
    const dt = last < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    const simDt = dt * speedMul(now);
    let active = false;
    for (const s of [...subs]) if (s.update(simDt, dt, now)) active = true;
    if (active && !env.hidden()) schedule();
    else last = -1;
  }
  return {
    add(s) {
      subs.push(s);
      schedule();
      return () => {
        const i = subs.indexOf(s);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    wake: schedule,
    dispose() {
      disposed = true;
      if (id !== null) env.caf(id);
      id = null;
    },
  };
}

import { hl } from '@/lib/hl';

/** A per-frame participant. Return true to keep the loop awake. */
export interface Subsystem {
  update(simDt: number, realDt: number, now: number): boolean | void;
}

export interface Loop {
  add(s: Subsystem): () => void;
  /** Restart ticking after the loop went idle (e.g. on a keypress). */
  wake(): void;
  dispose(): void;
}

/**
 * The single animation loop (Global Constraint 8): one `HL.register(stage, tick)`.
 * `speedMul(now)` scales sim time: simDt = realDt * speedMul.
 */
export function createLoop(stage: Element, speedMul: (now: number) => number): Loop {
  const subs: Subsystem[] = [];
  const handle = hl().register(stage, (dt, now) => {
    const simDt = dt * speedMul(now);
    let active = false;
    for (const s of [...subs]) if (s.update(simDt, dt, now)) active = true;
    return active;
  });
  return {
    add(s) {
      subs.push(s);
      handle.wake();
      return () => {
        const i = subs.indexOf(s);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    wake: () => handle.wake(),
    dispose: () => handle.unregister(),
  };
}

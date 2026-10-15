const WINDOW_MS = 10_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Typing-speed clock. WPM = keys in the last 10 s / 5 * 6; speedMul = clamp(1 + wpm/60, 1, 4). */
export class Clock {
  private keys: number[] = [];

  recordKey(nowMs: number): void {
    this.keys.push(nowMs);
    this.prune(nowMs);
  }

  wpm(nowMs: number): number {
    this.prune(nowMs);
    let n = 0;
    for (const t of this.keys) if (t <= nowMs) n++;
    return (n / 5) * 6;
  }

  speedMul(nowMs: number): number {
    return clamp(1 + this.wpm(nowMs) / 60, 1, 4);
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - WINDOW_MS;
    let i = 0;
    while (i < this.keys.length && this.keys[i] <= cutoff) i++;
    if (i > 0) this.keys.splice(0, i);
  }
}

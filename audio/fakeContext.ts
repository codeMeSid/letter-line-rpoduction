/**
 * Minimal fake Web Audio graph for node-env tests (no real audio). Only records what the app touches.
 * Not imported by app code.
 */
export class FakeParam {
  value: number;
  events: Array<[string, ...number[]]> = [];
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['lin', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (!(v > 0)) throw new Error('exponential ramp target must be > 0');
    this.events.push(['exp', v, t]); this.value = v; return this;
  }
  setTargetAtTime(v: number, t: number, k: number) { this.events.push(['target', v, t, k]); this.value = v; return this; }
  setValueCurveAtTime(c: Float32Array, t: number, d: number) {
    if (c.length < 2) throw new Error('curve needs >= 2 values');
    this.events.push(['curve', c.length, t, d]); return this;
  }
  cancelScheduledValues(t: number) { this.events.push(['cancel', t]); return this; }
}

export class FakeNode {
  connections: FakeNode[] = [];
  disconnected = false;
  connect<T extends FakeNode | FakeParam>(n: T): T {
    if (n instanceof FakeNode) this.connections.push(n);
    return n;
  }
  disconnect() { this.disconnected = true; }
}

export class FakeGain extends FakeNode { gain = new FakeParam(1); }
export class FakeSource extends FakeNode {
  frequency = new FakeParam(440);
  playbackRate = new FakeParam(1);
  type = 'sine';
  buffer: unknown = null;
  loop = false;
  started: number[] = [];
  stopped: number[] = [];
  onended: (() => void) | null = null;
  start(t = 0, offset?: number) { this.started.push(t); if (offset !== undefined && offset < 0) throw new Error('bad offset'); }
  stop(t = 0) { this.stopped.push(t); }
}
export class FakeBiquad extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}
export class FakePanner extends FakeNode { pan = new FakeParam(0); }
export class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam();
  attack = new FakeParam(); release = new FakeParam();
}
export class FakeShaper extends FakeNode { curve: Float32Array | null = null; }

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  panners: FakePanner[] = [];
  resumed = 0;
  closed = false;
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createOscillator() { const s = new FakeSource(); this.sources.push(s); return s; }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createBiquadFilter() { return new FakeBiquad(); }
  createStereoPanner() { const p = new FakePanner(); this.panners.push(p); return p; }
  createDynamicsCompressor() { return new FakeCompressor(); }
  createWaveShaper() { return new FakeShaper(); }
  createBuffer(_ch: number, length: number, _sr: number) {
    const data = new Float32Array(length);
    return { length, duration: length / this.sampleRate, getChannelData: () => data };
  }
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
}

export const asContext = (c: FakeAudioContext): AudioContext => c as unknown as AudioContext;

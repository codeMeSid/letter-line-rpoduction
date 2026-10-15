import { describe, expect, it } from 'vitest';
import { FakeAudioContext, FakeNode, asContext } from './fakeContext';
import { SampleProvider, SAMPLE_URLS } from './samples';
import { SynthProvider } from './synth';
import { LOOP_NAMES, SOUND_NAMES, isLoopName } from './types';

function ready() {
  const ctx = new FakeAudioContext();
  const p = new SynthProvider();
  p.init(asContext(ctx), new FakeNode() as unknown as AudioNode);
  return { ctx, p };
}

describe('SynthProvider', () => {
  it('has the binding 41 sound names with 6 loops', () => {
    expect(SOUND_NAMES).toHaveLength(41);
    expect(new Set(SOUND_NAMES).size).toBe(41);
    expect(LOOP_NAMES).toHaveLength(6);
  });

  it.each(SOUND_NAMES.map((n) => [n]))('plays %s with a finite positive duration and valid envelopes', (name) => {
    const { ctx, p } = ready();
    const h = p.play(name, { pan: 0.3, gain: 0.8, rate: 1.1 });
    expect(h).toBeTruthy();
    if (!h) return;
    expect(Number.isFinite(h.duration)).toBe(true);
    expect(h.duration).toBeGreaterThan(0);
    expect(h.duration).toBeLessThan(4);
    expect(ctx.sources.length).toBeGreaterThan(0);
    // every source scheduled to start is also scheduled to stop (nothing runs forever)
    for (const s of ctx.sources) {
      expect(s.started.length).toBe(1);
      expect(s.stopped.length).toBeGreaterThan(0);
    }
    expect(() => h.stop()).not.toThrow();
  });

  it.each(LOOP_NAMES.map((n) => [n]))('loops %s: sources run until stopped, gain is controllable', (name) => {
    const { ctx, p } = ready();
    const h = p.loop(name, { gain: 0.5 });
    expect(ctx.sources.length).toBeGreaterThan(0);
    for (const s of ctx.sources) expect(s.stopped).toHaveLength(0);
    // noise sources loop
    expect(ctx.sources.filter((s) => s.buffer).every((s) => s.loop)).toBe(true);
    const master = ctx.gains[0].gain; // the voice's out gain
    h.setGain(0.9, 100);
    expect(master.value).toBeCloseTo(0.9);
    h.stop();
    for (const s of ctx.sources) expect(s.stopped.length).toBeGreaterThan(0);
    expect(master.value).toBe(0); // faded out
    h.setGain(0.1); // ignored after stop
    expect(master.value).toBe(0);
  });

  it('loop() on a one-shot name is a no-op handle; before init everything is a no-op', () => {
    const { ctx, p } = ready();
    const h = p.loop('key-clack', {});
    expect(() => { h.setGain(1); h.stop(); }).not.toThrow();
    expect(ctx.sources).toHaveLength(0);
    const cold = new SynthProvider();
    expect(cold.play('ding', {})).toBeUndefined();
    expect(() => cold.loop('furnace-roar', {}).stop()).not.toThrow();
  });

  it('plays loop names as ~1s auditions that stop themselves', () => {
    const { ctx, p } = ready();
    const h = p.play('neon-buzz', {});
    expect(h && h.duration).toBeGreaterThan(0.5);
    expect(ctx.sources.every((s) => s.stopped.length > 0)).toBe(true);
    expect(isLoopName('neon-buzz')).toBe(true);
  });

  it('rate shortens the sound', () => {
    const slow = ready().p.play('glass-shatter', { rate: 0.5 });
    const fast = ready().p.play('glass-shatter', { rate: 2 });
    expect(slow && fast && slow.duration > fast.duration * 2).toBe(true);
  });

  it('pan creates a panner only when off-centre', () => {
    const a = ready();
    a.p.play('ding', { pan: 0 });
    expect(a.ctx.panners).toHaveLength(0);
    const b = ready();
    b.p.play('ding', { pan: -0.7 });
    expect(b.ctx.panners).toHaveLength(1);
    expect(b.ctx.panners[0].pan.value).toBe(-0.7);
  });
});

describe('SampleProvider stub', () => {
  it('ships with no samples and is a silent no-op for every name', () => {
    expect(Object.keys(SAMPLE_URLS)).toHaveLength(0);
    const ctx = new FakeAudioContext();
    const p = new SampleProvider();
    p.init(asContext(ctx), new FakeNode() as unknown as AudioNode);
    for (const n of SOUND_NAMES) {
      expect(p.play(n, {})).toBeUndefined();
      expect(() => p.loop(n, {}).stop()).not.toThrow();
    }
    expect(ctx.sources).toHaveLength(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { AudioBus, MAX_VOICES, volumeToGain } from './bus';
import { FakeAudioContext, asContext } from './fakeContext';
import { SynthProvider } from './synth';
import type { AudioProvider, LoopHandle, PlayOpts, SoundName, VoiceHandle } from './types';

class FakeProvider implements AudioProvider {
  inits = 0;
  plays: Array<{ name: SoundName; opts: PlayOpts }> = [];
  loops: Array<{ name: SoundName; opts: PlayOpts; handle: { gains: number[]; stopped: boolean } & LoopHandle }> = [];
  handles: Array<VoiceHandle & { stopped: boolean }> = [];
  constructor(private readonly durationS = 10) {}
  init() { this.inits++; }
  play(name: SoundName, opts: PlayOpts) {
    this.plays.push({ name, opts });
    const h = { stopped: false, duration: this.durationS, stop() { h.stopped = true; } };
    this.handles.push(h);
    return h;
  }
  loop(name: SoundName, opts: PlayOpts): LoopHandle {
    const handle = {
      gains: [opts.gain ?? 1], stopped: false,
      setGain(g: number) { handle.gains.push(g); },
      stop() { handle.stopped = true; },
    };
    this.loops.push({ name, opts, handle });
    return handle;
  }
}

function setup(opts: { volume?: number; enabled?: boolean; durationS?: number } = {}) {
  const provider = new FakeProvider(opts.durationS);
  const ctx = new FakeAudioContext();
  let t = 1000;
  const createContext = vi.fn(() => asContext(ctx));
  const bus = new AudioBus({ provider, createContext, now: () => t, volume: opts.volume, enabled: opts.enabled });
  return { bus, provider, ctx, createContext, advance: (ms: number) => { t += ms; } };
}

describe('AudioBus before unlock', () => {
  it('play and loop are no-ops that do not throw or create a context', () => {
    const { bus, provider, createContext } = setup();
    expect(() => bus.play('key-clack')).not.toThrow();
    const h = bus.loop('furnace-roar');
    expect(() => { h.setGain(0.5, 100); h.stop(); }).not.toThrow();
    expect(provider.plays).toHaveLength(0);
    expect(provider.loops).toHaveLength(0);
    expect(createContext).not.toHaveBeenCalled();
    expect(bus.unlocked).toBe(false);
  });

  it('loops requested before unlock start after unlock with the latest gain; stopped ones never start', () => {
    const { bus, provider } = setup();
    const a = bus.loop('furnace-roar', { gain: 0.8 });
    bus.loop('lehr-hum');
    const c = bus.loop('oven-hum');
    a.setGain(0.3);
    c.stop();
    bus.unlock();
    expect(provider.loops.map((l) => l.name)).toEqual(['furnace-roar', 'lehr-hum']);
    expect(provider.loops[0].opts.gain).toBe(0.3);
  });
});

describe('AudioBus unlock', () => {
  it('creates the context once, inits the provider once, resumes a suspended context', () => {
    const { bus, provider, ctx, createContext } = setup();
    bus.unlock();
    bus.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(provider.inits).toBe(1);
    expect(ctx.resumed).toBe(1); // second call sees it running
    expect(bus.unlocked).toBe(true);
  });

  it('stays silent (no throw) if the context cannot be created', () => {
    const provider = new FakeProvider();
    const bus = new AudioBus({ provider, createContext: () => { throw new Error('nope'); } });
    expect(() => bus.unlock()).not.toThrow();
    bus.play('ding');
    expect(provider.plays).toHaveLength(0);
  });

  it('forwards loop gain and stop after unlock', () => {
    const { bus, provider } = setup();
    bus.unlock();
    const h = bus.loop('conveyor-hum', { gain: 0.4 });
    h.setGain(0.9, 200);
    h.stop();
    h.setGain(0.1);
    const inner = provider.loops[0].handle;
    expect(inner.gains).toEqual([0.4, 0.9]);
    expect(inner.stopped).toBe(true);
  });

  it('restarts running loops on a new provider', () => {
    const { bus, provider } = setup();
    bus.unlock();
    bus.loop('kiln-roar');
    const next = new FakeProvider();
    bus.setProvider(next);
    expect(provider.loops[0].handle.stopped).toBe(true);
    expect(next.inits).toBe(1);
    expect(next.loops.map((l) => l.name)).toEqual(['kiln-roar']);
  });
});

describe('AudioBus throttle', () => {
  it('drops the same name within 40ms, allows it at 40ms', () => {
    const { bus, provider, advance } = setup();
    bus.unlock();
    bus.play('ding');
    advance(39);
    bus.play('ding');
    expect(provider.plays).toHaveLength(1);
    advance(1);
    bus.play('ding');
    expect(provider.plays).toHaveLength(2);
  });

  it('uses 15ms for key-clack and does not throttle across names', () => {
    const { bus, provider, advance } = setup();
    bus.unlock();
    bus.play('key-clack');
    advance(14);
    bus.play('key-clack');
    bus.play('ding');
    expect(provider.plays.map((p) => p.name)).toEqual(['key-clack', 'ding']);
    advance(1);
    bus.play('key-clack');
    expect(provider.plays.map((p) => p.name)).toEqual(['key-clack', 'ding', 'key-clack']);
  });
});

describe('AudioBus voice cap', () => {
  it('drops the oldest voice when the cap is exceeded', () => {
    const { bus, provider, advance } = setup({ durationS: 10 });
    bus.unlock();
    for (let i = 0; i < MAX_VOICES; i++) { bus.play('hiss'); advance(41); }
    expect(provider.handles.some((h) => h.stopped)).toBe(false);
    bus.play('hiss');
    expect(provider.handles).toHaveLength(MAX_VOICES + 1);
    expect(provider.handles[0].stopped).toBe(true);
    expect(provider.handles.slice(1).some((h) => h.stopped)).toBe(false);
  });

  it('SynthProvider cap actually stops the oldest voice sources', () => {
    const ctx = new FakeAudioContext();
    const provider = new SynthProvider();
    let t = 1000;
    const bus = new AudioBus({
      provider, createContext: () => asContext(ctx), now: () => t, volume: 1,
    });
    bus.unlock();
    bus.play('factory-bell');
    const live = ctx.sources.filter((s) => s.stopped.length === 0);
    expect(live.length).toBeGreaterThan(0);
    for (let i = 1; i < MAX_VOICES; i++) { t += 41; bus.play('factory-bell'); }
    expect(live.every((s) => s.stopped.length === 0)).toBe(true);
    t += 41;
    bus.play('factory-bell');
    expect(live.every((s) => s.stopped.length === 1)).toBe(true);
    expect(live.every((s) => s.disconnected)).toBe(true);
  });

  it('does not stop voices that already ended on their own', () => {
    const { bus, provider, advance } = setup({ durationS: 0.1 });
    bus.unlock();
    for (let i = 0; i < MAX_VOICES; i++) { bus.play('hiss'); advance(41); }
    advance(1000);
    bus.play('hiss');
    expect(provider.handles.some((h) => h.stopped)).toBe(false);
  });
});

describe('AudioBus volume', () => {
  it('maps volume and enabled to master gain', () => {
    expect(volumeToGain(0, true)).toBe(0);
    expect(volumeToGain(1, true)).toBe(1);
    expect(volumeToGain(0.6, true)).toBeCloseTo(0.36);
    expect(volumeToGain(0.6, false)).toBe(0);
    expect(volumeToGain(5, true)).toBe(1);
    expect(volumeToGain(-1, true)).toBe(0);
    expect(volumeToGain(NaN, true)).toBe(0);
  });

  it('applies the master gain on unlock and on changes (0 when sound is off)', () => {
    const { bus, ctx } = setup({ volume: 0.5 });
    bus.unlock();
    const master = ctx.gains[0].gain; // first gain created by the bus is the master
    expect(master.value).toBeCloseTo(0.25);
    bus.setVolume(1);
    expect(master.value).toBe(1);
    bus.setEnabled(false);
    expect(master.value).toBe(0);
    bus.setEnabled(true);
    expect(master.value).toBe(1);
    expect(bus.masterGain).toBe(1);
  });

  it('uses the volume set before unlock when unlocking', () => {
    const { bus, ctx } = setup();
    bus.setVolume(0.8);
    bus.setEnabled(false);
    bus.unlock();
    expect(ctx.gains[0].gain.value).toBe(0);
    bus.setEnabled(true);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.64);
  });

  it('stops loop sources on mute and restarts them on unmute', () => {
    const { bus, provider } = setup();
    bus.unlock();
    bus.loop('furnace-roar');
    expect(provider.loops).toHaveLength(1);
    expect(provider.loops[0].handle.stopped).toBe(false);
    bus.setEnabled(false);
    expect(provider.loops[0].handle.stopped).toBe(true);
    bus.setEnabled(true);
    expect(provider.loops).toHaveLength(2);
    expect(provider.loops[1].handle.stopped).toBe(false);
    bus.setVolume(0);
    expect(provider.loops[1].handle.stopped).toBe(true);
    bus.setVolume(0.6);
    expect(provider.loops).toHaveLength(3);
    expect(provider.loops[2].handle.stopped).toBe(false);
  });

  it('does not play one-shots while disabled or at volume 0', () => {
    const { bus, provider, advance } = setup({ enabled: false });
    bus.unlock();
    bus.play('ding');
    bus.setEnabled(true);
    bus.setVolume(0);
    advance(100);
    bus.play('ding');
    expect(provider.plays).toHaveLength(0);
    bus.setVolume(0.5);
    bus.play('ding');
    expect(provider.plays).toHaveLength(1);
  });
});

describe('AudioBus pan', () => {
  it('derives pan from world x relative to the listener, clamped; explicit pan wins', () => {
    const { bus, provider, advance } = setup();
    bus.unlock();
    bus.setListener(1000, 500);
    const pans: Array<number | undefined> = [];
    for (const o of [{ x: 1000 }, { x: 1250 }, { x: 600 }, { x: 5000 }, { x: -5000 }, { x: 1250, pan: -0.2 }, {}]) {
      bus.play('hiss', o);
      advance(50);
    }
    provider.plays.forEach((p) => pans.push(p.opts.pan));
    expect(pans).toEqual([0, 0.5, -0.8, 1, -1, -0.2, 0]);
  });

  it('passes gain and rate through', () => {
    const { bus, provider } = setup();
    bus.unlock();
    bus.play('ding', { gain: 0.5, rate: 1.2 });
    expect(provider.plays[0].opts).toMatchObject({ gain: 0.5, rate: 1.2 });
  });
});

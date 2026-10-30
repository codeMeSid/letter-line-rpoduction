import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../../audio/bus';
import { Director } from '../../engine/director';
import { FactoryHost } from '../../engine/factoryHost';
import { Looks } from '../../engine/looks';
import { ParticleSystem } from '../../engine/particles';
import { defaultSettings, type Settings } from '../../engine/settings';
import { donutFactory } from './index';

describe('donut factory end to end (headless)', () => {
  it('types "Hi" and shelves both donuts in order, upright with their lettering', () => {
    const settings: Settings = { ...defaultSettings, product: 'donut', defects: false };
    const director = new Director({ settings: () => settings, now: () => 0 });
    const host = new FactoryHost(donutFactory, [0, 0, 0], {
      parent: new THREE.Group(), looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
      director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0,
    }, settings.layout);
    director.handle({ type: 'char', char: 'H' });
    director.handle({ type: 'char', char: 'i' });
    const filled = () => director.shelf('donut').rows.flat().filter((s) => s.state === 'filled').length;
    for (let i = 0; i < 60 * 240 && filled() < 2; i++) { director.update(1 / 60); host.update(1 / 60, 1 / 60); }
    expect(filled()).toBe(2);
    expect(director.shelf('donut').text()).toBe('Hi');
    const donuts = host.shelfView.group.children.filter((c) => c.getObjectByName('donut'));
    expect(donuts).toHaveLength(2);
    for (const d of donuts) expect(d.getObjectByName('bed')!.visible).toBe(false);
  });
});

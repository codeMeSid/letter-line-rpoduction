import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../../audio/bus';
import { Director } from '../../engine/director';
import { FactoryHost } from '../../engine/factoryHost';
import { Looks } from '../../engine/looks';
import { ParticleSystem } from '../../engine/particles';
import { defaultSettings, type Settings } from '../../engine/settings';
import { canFactory } from './index';

describe('can factory end to end (headless)', () => {
  it('types "Hi" and shelves both cans in order, printed and upright', () => {
    const settings: Settings = { ...defaultSettings, product: 'can', defects: false };
    const director = new Director({ settings: () => settings, now: () => 0 });
    const host = new FactoryHost(canFactory, [0, 0, 0], {
      parent: new THREE.Group(), looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
      director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0,
    }, settings.layout);
    director.handle({ type: 'char', char: 'H' });
    director.handle({ type: 'char', char: 'i' });
    const filled = () => director.shelf('can').rows.flat().filter((s) => s.state === 'filled').length;
    for (let i = 0; i < 60 * 300 && filled() < 2; i++) { director.update(1 / 60); host.update(1 / 60, 1 / 60); }
    expect(filled()).toBe(2);
    expect(director.shelf('can').text()).toBe('Hi');
    const cans = host.shelfView.group.children.filter((c) => c.getObjectByName('can'));
    expect(cans).toHaveLength(2);
    for (const c of cans) expect(c.getObjectByName('sleeve')!.visible).toBe(true);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../../audio/bus';
import { Director } from '../../engine/director';
import { FactoryHost } from '../../engine/factoryHost';
import { Looks } from '../../engine/looks';
import { ParticleSystem } from '../../engine/particles';
import { defaultSettings, type Settings } from '../../engine/settings';
import { cookieFactory } from './index';

describe('cookie factory end to end (headless)', () => {
  it('types "Hi" and shelves both cookies in order, packed and lying on the tray', () => {
    const settings: Settings = { ...defaultSettings, product: 'cookie', defects: false };
    const director = new Director({ settings: () => settings, now: () => 0 });
    const host = new FactoryHost(cookieFactory, [0, 0, 0], {
      parent: new THREE.Group(), looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
      director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0,
    }, settings.layout);
    director.handle({ type: 'char', char: 'H' });
    director.handle({ type: 'char', char: 'i' });
    const filled = () => director.shelf('cookie').rows.flat().filter((s) => s.state === 'filled').length;
    for (let i = 0; i < 60 * 240 && filled() < 2; i++) { director.update(1 / 60); host.update(1 / 60, 1 / 60); }
    expect(filled()).toBe(2);
    expect(director.shelf('cookie').text()).toBe('Hi');
    const cookies = host.shelfView.group.children.filter((c) => c.getObjectByName('cookie'));
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c.getObjectByName('bed')!.visible).toBe(false);
      expect(c.getObjectByName('cup')!.visible).toBe(true);
      expect(c.getObjectByName('icing')!.visible).toBe(true);
    }
  });
});

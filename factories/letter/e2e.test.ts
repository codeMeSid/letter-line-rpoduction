import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../../audio/bus';
import { Director } from '../../engine/director';
import { FactoryHost } from '../../engine/factoryHost';
import { Looks } from '../../engine/looks';
import { ParticleSystem } from '../../engine/particles';
import { defaultSettings, type Settings } from '../../engine/settings';
import { letterFactory } from './index';

describe('letter factory end to end (headless)', () => {
  it('types "Hi" and shelves both letters in order, polished and upright', () => {
    const settings: Settings = { ...defaultSettings };
    const director = new Director({ settings: () => settings, now: () => 0 });
    const host = new FactoryHost(letterFactory, [0, 0, 0], {
      parent: new THREE.Group(), looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
      director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0,
    }, settings.layout);
    director.handle({ type: 'char', char: 'H' });
    director.handle({ type: 'char', char: 'i' });
    // Shelf.text() already reads 'Hi' once the slots are reserved, so wait for both slots to be filled.
    const filled = () => director.shelf('letter').rows.flat().filter((s) => s.state === 'filled').length;
    for (let i = 0; i < 60 * 90 && filled() < 2; i++) { director.update(1 / 60); host.update(1 / 60, 1 / 60); }
    expect(filled()).toBe(2);
    expect(director.shelf('letter').text()).toBe('Hi');
    const letters = host.shelfView.group.children.filter((c) => c.getObjectByName('letter'));
    expect(letters).toHaveLength(2);
    for (const l of letters) expect(l.getObjectByName('letter')!.rotation.x).toBeCloseTo(0, 6);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ParticleSystem } from './particles';
import { ParticlesView, PARTICLE_LAYER } from './particlesView';

describe('ParticlesView', () => {
  it('splits normal and additive kinds and mirrors positions', () => {
    const sys = new ParticleSystem();
    sys.emit('sand', { pos: [1, 2, 3], count: 2, spread: 0 });
    sys.emit('spark', { pos: [4, 5, 6], count: 3, spread: 0 });
    const view = new ParticlesView(sys, () => new THREE.Color(1, 0, 0));
    expect(view.sync()).toEqual({ normal: 2, additive: 3 });
    const [normal, additive] = view.group.children as THREE.Points[];
    expect(normal.geometry.drawRange.count).toBe(2);
    expect(additive.geometry.drawRange.count).toBe(3);
    const p = additive.geometry.getAttribute('position');
    expect([p.getX(0), p.getY(0), p.getZ(0)]).toEqual([4, 5, 6]);
    expect(normal.layers.mask).toBe(1 << PARTICLE_LAYER);
    view.dispose();
  });
});

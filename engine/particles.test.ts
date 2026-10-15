import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, ParticleSystem } from './particles';

describe('ParticleSystem', () => {
  it('falls to the floor, expires, and caps the pool', () => {
    const ps = new ParticleSystem();
    ps.emit('sand', { pos: [0, 0, 50], count: 10, spread: 0 });
    expect(ps.count).toBe(10);
    for (let i = 0; i < 20; i++) ps.update(0.05);
    for (let i = 0; i < ps.count; i++) expect(ps.zOf(i)).toBeGreaterThanOrEqual(0);
    expect(ps.zOf(0)).toBeLessThan(50);
    expect(ps.update(5)).toBe(false);
    ps.emit('spark', { pos: [0, 0, 0], count: MAX_PARTICLES + 50 });
    expect(ps.count).toBe(MAX_PARTICLES);
  });

  it('density scales emit counts (reduced motion)', () => {
    const ps = new ParticleSystem();
    ps.density = 0.2;
    ps.emit('smoke', { pos: [0, 0, 0], count: 10 });
    expect(ps.count).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { FactorySite } from './site';
import { meshes, miniFactory } from './testkit';

describe('FactorySite', () => {
  it('wraps the host floor box in a building and shows the finished product on the sign', () => {
    const f = miniFactory();
    const site = new FactorySite(f.host, { looks: f.looks, director: f.director, audio: f.audio, particles: f.particles, settings: () => f.settings }, f.parent);
    expect(site.group.parent).toBe(f.parent);
    expect(meshes(site.building.group).length).toBeGreaterThan(30);
    expect(f.handles.length).toBe(1); // the sign product
    const sign = f.handles[0];
    expect(sign.root.scale.x).toBe(3);
    site.rebuild();
    expect(sign.disposed).toBe(true);    // the old sign product was disposed
    expect(f.handles.length).toBe(2);
    site.dispose();
    expect(f.handles[1].disposed).toBe(true);
    expect(site.group.parent).toBeNull();
  });
});

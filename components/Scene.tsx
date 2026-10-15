'use client';

import { useEffect, useRef } from 'react';
import { hl } from '@/lib/hl';
import { AudioBus } from '@/audio/bus';
import { Camera, type Box } from '@/engine/camera';
import { Director } from '@/engine/director';
import { FactoryHost } from '@/engine/factoryHost';
import { keyToCommand } from '@/engine/input';
import { createLoop } from '@/engine/loop';
import { Palette } from '@/engine/palette';
import { ParticleSystem } from '@/engine/particles';
import { settingsStore } from '@/engine/settings';
import { PRODUCT_KINDS, type ProductKind, type Vec3 } from '@/engine/types';
import { createWorld } from '@/engine/world';
import { FACTORIES, factoryOrigin } from '@/factories/registry';

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Client entry: mounts world, factories, director, camera and the single loop; routes keys. */
export default function Scene() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const HL = hl();
    const C = HL.Cam(45, 0.5, 1);
    const P = HL.proj(C);
    const settings = () => settingsStore.getState();
    const now = () => performance.now();
    const s0 = settings();

    const world = createWorld(root);
    world.setTheme(s0.theme);
    world.setColor(s0.colorMode);
    const palette = new Palette(root);
    const particles = new ParticleSystem();
    const audio = new AudioBus({ volume: s0.volume, enabled: s0.sound });
    const director = new Director({ settings, now, audio });

    const hosts = new Map<ProductKind, FactoryHost>();
    for (const kind of PRODUCT_KINDS) {
      const def = FACTORIES[kind];
      if (!def) continue;
      hosts.set(kind, new FactoryHost(def, factoryOrigin(kind), {
        C, P, layers: world.layers, director, particles, audio, settings, now,
      }, s0.layout));
    }
    const overviewOf = (kind: ProductKind): { min: Vec3; max: Vec3 } => {
      const h = hosts.get(kind);
      if (h) return h.bounds();
      const [x, y] = factoryOrigin(kind); // no factory yet: an empty floor patch
      return { min: [x, y, 0], max: [x + 600, y + 400, 60] };
    };
    const active = () => hosts.get(settings().product) ?? null;

    const camera = new Camera(world.svg, C, P, {
      overview: () => overviewOf(settings().product),
      newest: () => active()?.newest() ?? null,
      busiest: () => active()?.busiest() ?? null,
      followSpan: () => active()?.followSpan() ?? 400,
    });
    let size = world.size();
    camera.resize(size.w, size.h);
    camera.mode = s0.camera;
    const ov = overviewOf(s0.product);
    camera.snap(camera.fitBox(ov.min, ov.max));

    const loop = createLoop(root, (t) => director.speedMul(t));
    const offLoop = loop.add({
      update(simDt, realDt, t) {
        let busy = director.update(simDt);
        const view = camera.box();
        const current = settings().product;
        for (const [kind, host] of hosts) {
          const b = host.bounds();
          if (kind !== current && !overlaps(view, camera.fitBox(b.min, b.max, 0))) continue; // culled
          if (host.update(simDt, realDt)) busy = true;
        }
        if (camera.update(realDt, t)) busy = true;
        const c = camera.center();
        audio.setListener(c.x, c.halfWidth);
        particles.density = HL.reducedMotion() ? 0.2 : 1;
        if (particles.update(realDt)) busy = true;
        if (world.ctx2d) particles.draw(world.ctx2d, camera, palette, size.w, size.h);
        return busy;
      },
    });

    const onKey = (e: KeyboardEvent) => {
      audio.unlock(); // first gesture creates the AudioContext; later calls just resume
      const cmd = keyToCommand({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: e.target as Element | null });
      if (!cmd) return;
      e.preventDefault();
      director.handle(cmd);
      loop.wake();
    };
    const onPointer = () => audio.unlock();
    const onResize = () => {
      world.resize();
      size = world.size();
      camera.resize(size.w, size.h);
      loop.wake();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onResize);

    const unsub = settingsStore.subscribe((s, p) => {
      if (s.theme !== p.theme) world.setTheme(s.theme);
      if (s.colorMode !== p.colorMode) world.setColor(s.colorMode);
      if (s.theme !== p.theme || s.colorMode !== p.colorMode) palette.refresh();
      if (s.layout !== p.layout) for (const h of hosts.values()) h.relayout(s.layout);
      if (s.product !== p.product) {
        const b = overviewOf(s.product);
        camera.panTo(camera.fitBox(b.min, b.max));
      }
      if (s.camera !== p.camera) camera.mode = s.camera;
      if (s.volume !== p.volume) audio.setVolume(s.volume);
      if (s.sound !== p.sound) audio.setEnabled(s.sound);
      loop.wake();
    });

    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onResize);
      offLoop();
      loop.dispose();
      for (const h of hosts.values()) h.destroy();
      audio.dispose();
      world.dispose();
    };
  }, []);

  return <div ref={rootRef} />;
}

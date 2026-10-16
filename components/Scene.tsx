'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AudioBus } from '@/audio/bus';
import { CameraRig, type CameraMode } from '@/engine/camera';
import { Director } from '@/engine/director';
import { FactoryHost } from '@/engine/factoryHost';
import { keyToCommand } from '@/engine/input';
import { CONVEYOR_SPEED } from '@/engine/line';
import { createLoop } from '@/engine/loop';
import { Looks, type LookOptions } from '@/engine/looks';
import { paceParams } from '@/engine/pace';
import { ParticleSystem } from '@/engine/particles';
import { ParticlesView } from '@/engine/particlesView';
import { createPost } from '@/engine/post';
import { createRenderer } from '@/engine/renderer';
import { settingsStore, type Settings } from '@/engine/settings';
import { createStage } from '@/engine/stage';
import { PRODUCT_KINDS, type LayoutMode, type ProductKind, type Vec3 } from '@/engine/types';
import { FACTORIES, factoryOrigin } from '@/factories/registry';
import Hud from '@/hud/Hud';

const lookOpts = (s: Settings): LookOptions => ({ look: s.look, theme: s.theme, colorMode: s.colorMode, quality: s.quality });
/** Cutaway needs one straight row so a single clipping plane cuts every machine. */
const effLayout = (s: Settings): LayoutMode => (s.look === 'cutaway' ? 'pan' : s.layout);
const modeOf = (s: Settings): CameraMode => (paceParams(s.pace).lockFollow ? 'follow' : s.camera);

/** Client entry: renderer, looks, camera rig, factories, director and the single loop; routes keys. */
export default function Scene() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const settings = () => settingsStore.getState();
    const now = () => performance.now();
    const s0 = settings();

    const r = createRenderer(root, s0.quality);
    const looks = new Looks(lookOpts(s0));
    const stage = createStage(r.gl, r.scene);
    const post = createPost(r.gl, r.scene);
    const particles = new ParticleSystem();
    const pview = new ParticlesView(particles, (k) => looks.particleColor(k));
    r.scene.add(pview.group);
    const audio = new AudioBus({ volume: s0.volume, enabled: s0.sound });
    const director = new Director({ settings, now, audio });
    const world = new THREE.Group();
    r.scene.add(world);

    const hosts = new Map<ProductKind, FactoryHost>();
    for (const kind of PRODUCT_KINDS) {
      const def = FACTORIES[kind];
      if (def) hosts.set(kind, new FactoryHost(def, factoryOrigin(kind), { parent: world, looks, director, particles, audio, settings, now }, effLayout(s0)));
    }
    const active = () => hosts.get(settings().product) ?? null;
    const overview = (): { min: Vec3; max: Vec3 } => {
      const h = active();
      if (h) return h.bounds();
      const [x, y] = factoryOrigin(settings().product);
      return { min: [x, y - 400, 0], max: [x + 800, y, 60] };
    };
    const rig = new CameraRig({
      overview,
      newest: () => active()?.newest() ?? null,
      busiest: () => active()?.busiest() ?? null,
      followSpan: () => active()?.followSpan() ?? 400,
    });
    const cut = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const fitStage = () => {
      const b = overview();
      stage.fitShadow(b.min, b.max);
      const a = active();
      if (a) cut.constant = -a.layout.anchors[0][1];
    };
    const applyLook = () => {
      const s = settings();
      looks.set(lookOpts(s));
      looks.apply(r.scene);
      for (const h of hosts.values()) h.restyle();
      pview.refresh();
      stage.setLook(looks);
      rig.setLook(s.look);
      post.configure(s.look, s.quality, looks.edgeColor());
      r.gl.clippingPlanes = s.look === 'cutaway' ? [cut] : [];
    };
    const resize = () => {
      r.resize();
      const { w, h } = r.size();
      rig.resize(w, h, r.gl.getPixelRatio());
      post.setSize(w, h, r.gl.getPixelRatio());
    };

    applyLook();
    fitStage();
    rig.mode = modeOf(s0);
    resize();
    rig.attach(r.gl.domElement);
    rig.snap();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const loop = createLoop((t) => director.speedMul(t));
    const offLoop = loop.add({
      update(simDt, realDt, t) {
        director.update(simDt);
        looks.scrollBelts(simDt * CONVEYOR_SPEED);
        const cur = settings().product;
        for (const [kind, host] of hosts) {
          host.root.visible = kind === cur;
          if (kind === cur) host.update(simDt, realDt);
        }
        rig.update(realDt, t);
        const c = rig.center();
        audio.setListener(c.x, c.halfWidth);
        particles.density = reduced.matches ? 0.2 : 1;
        particles.update(realDt);
        pview.sync();
        pview.setProjection(rig.pointScale(), rig.isOrtho());
        post.render(rig.active());
        return true;
      },
    });

    const onKey = (e: KeyboardEvent) => {
      audio.unlock();
      if (e.key === 'Escape') {
        settings().set({ hudOpen: !settings().hudOpen });
        return;
      }
      const cmd = keyToCommand({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: e.target as Element | null });
      if (!cmd) return;
      e.preventDefault();
      director.handle(cmd);
      loop.wake();
    };
    const onPointer = () => audio.unlock();
    const onVisible = () => loop.wake();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisible);

    const unsub = settingsStore.subscribe((s, p) => {
      if (s.quality !== p.quality) { r.setQuality(s.quality); resize(); }
      if (s.look !== p.look || s.theme !== p.theme || s.colorMode !== p.colorMode || s.quality !== p.quality) applyLook();
      if (effLayout(s) !== effLayout(p)) { for (const h of hosts.values()) h.relayout(effLayout(s)); fitStage(); }
      if (s.product !== p.product) fitStage();
      if (s.camera !== p.camera || s.pace !== p.pace) rig.mode = modeOf(s);
      if (s.volume !== p.volume) audio.setVolume(s.volume);
      if (s.sound !== p.sound) audio.setEnabled(s.sound);
      loop.wake();
    });

    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
      offLoop();
      loop.dispose();
      for (const h of hosts.values()) h.destroy();
      rig.dispose();
      pview.dispose();
      post.dispose();
      stage.dispose();
      looks.dispose();
      audio.dispose();
      r.dispose();
    };
  }, []);

  return (
    <>
      <div ref={rootRef} className="stage" />
      <Hud />
    </>
  );
}

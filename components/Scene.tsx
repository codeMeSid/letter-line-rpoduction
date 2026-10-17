'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AudioBus } from '@/audio/bus';
import { CameraRig, type CameraMode } from '@/engine/camera';
import { Director } from '@/engine/director';
import { FactoryHost } from '@/engine/factoryHost';
import { keyRoute, keyToCommand } from '@/engine/input';
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
import { FACTORIES, factoryOrigin, PLOTS } from '@/factories/registry';
import { ConstructionSite } from '@/fx/construction';
import { Destroyer } from '@/fx/destroyer';
import { buildGround } from '@/fx/ground';
import { FactorySite } from '@/fx/site';
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
    const ground = buildGround(looks, PLOTS);
    world.add(ground.group);
    const sites = new Map<ProductKind, FactorySite>();
    for (const [kind, host] of hosts) sites.set(kind, new FactorySite(host, { looks, director, audio, particles, settings }, world));
    const yardOf = new Map<ProductKind, ConstructionSite>();
    for (const p of PLOTS) if (!p.built) { const c = new ConstructionSite(looks, p); world.add(c.group); yardOf.set(p.kind, c); }
    const yards = [...yardOf.values()];
    // every kind is a built host (machines + shelf in frame) or an unbuilt plot (the crane sets the height)
    const boundsOf = (kind: ProductKind): { min: Vec3; max: Vec3 } => hosts.get(kind)?.bounds() ?? yardOf.get(kind)!.bounds();
    const active = () => hosts.get(settings().product) ?? null;
    const overview = () => boundsOf(settings().product);
    const rig = new CameraRig({
      overview,
      newest: () => active()?.newest() ?? null,
      busiest: () => active()?.busiest() ?? null,
      followSpan: () => active()?.followSpan() ?? 400,
    });

    const destroyer = new Destroyer({
      director, looks, particles, audio, settings, hosts, sites,
      flash: (p) => stage.flash(p), shake: (m) => rig.shake(m),
    });
    world.add(destroyer.group);
    director.setBackspaceHandler(destroyer);

    const fitStage = () => {
      const b = overview();
      stage.fitShadow(b.min, b.max);
      const a = active();
      if (a) looks.cutPlane.constant = -a.layout.anchors[0][1];
    };
    const applyLook = () => {
      const s = settings();
      looks.set(lookOpts(s));
      looks.apply(r.scene);
      for (const h of hosts.values()) h.restyle();
      for (const site of sites.values()) site.restyle();
      destroyer.restyle();
      pview.refresh();
      stage.setLook(looks);
      rig.setLook(s.look);
      post.configure(s.look, s.quality, looks.edgeColor());
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
        hosts.get(cur)?.update(simDt, realDt);
        sites.get(cur)?.update(realDt, 0); // night wired in Task 18
        for (const y of yards) y.update(realDt);
        destroyer.update(realDt);
        stage.tick(realDt);
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
      const t = e.target instanceof HTMLElement ? e.target : null;
      const route = keyRoute(e.key, settings().hudOpen, t);
      if (route === 'hud') {
        settings().set({ hudOpen: !settings().hudOpen });
        return;
      }
      if (route === 'block') e.preventDefault();
      if (route !== 'factory') return;
      const onHud = !!t?.closest('.hud, .hud-toggle');
      if (onHud) t!.blur(); // a HUD control that kept focus must not swallow typing
      const cmd = keyToCommand({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, target: onHud ? null : t });
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

    const offRow = director.events.on('row:new', fitStage); // a new shelf row changes the overview bounds
    const unsub = settingsStore.subscribe((s, p) => {
      if (s.quality !== p.quality) { r.setQuality(s.quality); resize(); }
      if (s.look !== p.look || s.theme !== p.theme || s.colorMode !== p.colorMode || s.quality !== p.quality) applyLook();
      if (effLayout(s) !== effLayout(p)) {
        for (const [kind, h] of hosts) { h.relayout(effLayout(s)); sites.get(kind)?.rebuild(); }
        fitStage();
      }
      if (s.product !== p.product) { rig.fly(boundsOf(p.product), performance.now()); fitStage(); audio.play('whoosh'); }
      if (s.camera !== p.camera || s.pace !== p.pace) rig.mode = modeOf(s);
      if (s.volume !== p.volume) audio.setVolume(s.volume);
      if (s.sound !== p.sound) audio.setEnabled(s.sound);
      loop.wake();
    });

    return () => {
      unsub();
      offRow();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
      offLoop();
      loop.dispose();
      for (const site of sites.values()) site.dispose();
      for (const y of yards) y.dispose();
      director.setBackspaceHandler(null);
      destroyer.dispose();
      ground.dispose();
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

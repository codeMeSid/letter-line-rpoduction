'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Looks } from '@/engine/looks';
import { createRenderer } from '@/engine/renderer';
import { settingsStore } from '@/engine/settings';
import { createStage } from '@/engine/stage';

/** Task 6 shell: renderer + stage + floor. Task 9 mounts factories, camera rig, HUD. */
export default function Scene() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const s = settingsStore.getState();
    const r = createRenderer(root, s.quality);
    const looks = new Looks({ look: s.look, theme: s.theme, colorMode: s.colorMode, quality: s.quality });
    const stage = createStage(r.gl, r.scene);
    stage.setLook(looks);
    const floor = looks.part(new THREE.BoxGeometry(1200, 800, 4).translate(0, 0, -2), 'concrete');
    r.scene.add(floor);
    stage.fitShadow([-600, -400, 0], [600, 400, 100]);
    const cam = new THREE.PerspectiveCamera(32, 1, 1, 20000);
    cam.up.set(0, 0, 1);
    cam.position.set(700, -1300, 1000);
    cam.lookAt(0, 0, 0);
    const draw = () => {
      const { w, h } = r.size();
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      r.gl.render(r.scene, cam);
    };
    const onResize = () => { r.resize(); draw(); };
    window.addEventListener('resize', onResize);
    draw();
    return () => {
      window.removeEventListener('resize', onResize);
      floor.geometry.dispose();
      looks.dispose();
      stage.dispose();
      r.dispose();
    };
  }, []);
  return <div ref={rootRef} className="stage" />;
}

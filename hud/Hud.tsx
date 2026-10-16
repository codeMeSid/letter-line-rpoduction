'use client';

import { settingsStore, useSettings } from '../engine/settings';
import { LOOKS, PACES, type Look, type Pace, type Quality } from '../engine/types';

const LOOK_LABEL: Record<Look, string> = { realistic: 'Realistic', lineart: 'Line art', flat: 'Flat iso', cutaway: 'Cutaway' };
const PACE_LABEL: Record<Pace, string> = { auto: 'Auto (typing speed)', fast: 'Fast', detailed: 'Detailed', cinematic: 'Cinematic (one at a time)' };
const CAMERAS = ['overview', 'follow', 'cinematic'] as const;

/** Minimal settings panel (Escape toggles). Full HUD lands in a later plan. */
export default function Hud() {
  const s = useSettings((x) => x);
  const set = settingsStore.getState().set;
  if (!s.hudOpen) {
    return <button type="button" className="hud-toggle" onClick={(e) => { e.currentTarget.blur(); set({ hudOpen: true }); }} aria-label="Open settings">⚙</button>;
  }
  return (
    <aside className="hud" aria-label="Factory settings">
      <header>
        <span>Factory</span>
        <button type="button" onClick={(e) => { e.currentTarget.blur(); set({ hudOpen: false }); }} aria-label="Close settings">×</button>
      </header>
      <label>Look
        <select value={s.look} onChange={(e) => { e.target.blur(); set({ look: e.target.value as Look }); }}>
          {LOOKS.map((l) => <option key={l} value={l}>{LOOK_LABEL[l]}</option>)}
        </select>
      </label>
      <label>Pace
        <select value={s.pace} onChange={(e) => { e.target.blur(); set({ pace: e.target.value as Pace }); }}>
          {PACES.map((p) => <option key={p} value={p}>{PACE_LABEL[p]}</option>)}
        </select>
      </label>
      <label>Camera
        <select value={s.camera} onChange={(e) => { e.target.blur(); set({ camera: e.target.value as (typeof CAMERAS)[number] }); }} disabled={s.pace === 'cinematic'}>
          {CAMERAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Theme
        <select value={s.theme} onChange={(e) => { e.target.blur(); set({ theme: e.target.value as 'light' | 'dark' }); }}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label>Quality
        <select value={s.quality} onChange={(e) => { e.target.blur(); set({ quality: e.target.value as Quality }); }}>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="hud-row">
        <input type="checkbox" checked={s.sound} onChange={(e) => { e.target.blur(); set({ sound: e.target.checked }); }} />
        Sound
      </label>
      <label>Volume
        <input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={!s.sound} onChange={(e) => set({ volume: Number(e.target.value) })} onPointerUp={(e) => e.currentTarget.blur()} />
      </label>
    </aside>
  );
}

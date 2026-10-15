# 3D Core + Cast Metal Letter: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Hairline 2D SVG renderer with a Three.js scene that has four looks. Then build the cast metal letter factory end to end: type a key, and a real machine line moulds, pours, cools, shakes out, grinds and polishes that letter, then a robot shelves it.

**Architecture:**
- Plain `three`, imperative, outside React. React renders only the HUD.
- The pure simulation is kept: `Line`, `Director`, `Shelf`, `layout`, `glyphs`, `audio`.
- Every mesh comes from `looks.part(geometry, role)`. A look is a role → material table, plus a camera kind and a post chain.
- Products are `ProductHandle`s with `shape(stage, t)`. Stations drive `shape` continuously while the product is inside them.

**Tech Stack:**
- Next 15.5 + React 19, TypeScript 5.9 strict, pnpm, vitest 5 (node env)
- `three@0.186.1` + `@types/three@0.186.0`, addons via `three/addons/...`
- zustand 5

**Spec:** `docs/superpowers/specs/2026-10-16-3d-factory-design.md`. Read it before any task.

**Scope:** spec milestones M1 (3D core) and M2 (metal letter factory). M3 onward (shotgun/chute/forklift, bottle, extras, other factories) gets its own plan.

**Deliberate deviations from the spec:**
- The brass finish is skipped; chrome only.
- The letter mould is an *open-face* sand mould. At shakeout the flask halves slide apart; there is no separate cope, so the pour stays visible.
- `glyphStrokes3D` is deferred to the bottle plan, because nothing here needs it.
- In `quality: low` the line-art look keeps its edge pass, because the edge pass *is* the look.

## Global Constraints

- Dependencies: `three@0.186.1` and `@types/three@0.186.0`, exact pins. Import addons as `three/addons/<path>.js`. No other new runtime dependency.
- **World is z-up.** Every camera sets `up = (0,0,1)`. World units are unchanged: station footprints are about 90–130, products about 26–46.
- **The viewer stands at −y.** +x reads left→right on screen. The shelf is in front (y below the line). Snake rows advance toward −y, so the last station is nearest the shelf.
- **Station local frame:** the station `group` sits at its anchor. Local z = 0 is the belt top (world z = `BELT_TOP` = 22) and the floor is local z = −22. The product root sits at `job.pos` with its own z = 0 resting on the belt.
- **Materials:** meshes are created only through `looks.part(geom, role)`, or `new THREE.Mesh(geom, looks.own(role))` for per-instance animated parts. No `new THREE.*Material(...)` outside `engine/looks.ts`. The only exceptions are the post/particle shaders in `engine/edgePass.ts` (`ShaderMaterial`, `MeshNormalMaterial`) and `engine/particlesView.ts` (`ShaderMaterial`).
- **Particles** are emitted only while a station processes a (non-space) job. No ambient particles, which keeps space and idle runs particle-free.
- **One `requestAnimationFrame` loop** (`engine/loop.ts`). No `setInterval`/`setTimeout`/CSS animation for scene objects. OrbitControls is updated from the loop.
- **Letters** come only from `engine/glyphs.ts` strokes (`letterGeometry`). No fonts, no `TextGeometry`, no `<text>`.
- **Sound** goes only through `audio/bus.ts`. Default `sound: false`. Space jobs make no sound and no particles.
- One station per file. Every station has idle ambient motion and handles `update(dt, null, 0, null)`.
- **Product continuity:** `shape(S_k, 1)` looks identical to `shape(S_{k+1}, 0)`. A handle is built once at its own origin and moved by `root.position`.
- **Pure and node-testable:** `engine/{types,charset,settings,clock,events,line,layout,input,director,glyphs,surface,pace,letterSolid}`, `factories/shared/ik.ts`, `factories/letter/visual.ts`. Three geometry, materials and scene graph are fine in node; `WebGLRenderer` is never constructed in tests.
- **Imports:** everything under `engine/`, `factories/`, `shelf/`, `audio/`, `lib/`, `hud/` uses **relative** imports (vitest has no `@/` alias). `app/` and `components/` may use `@/`.
- **Before every commit:** `pnpm typecheck && pnpm test && pnpm build` all pass. Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Dev pages** (`app/dev/*`) call `notFound()` when `process.env.NODE_ENV === 'production'`.
- **Perf budget:** 60 fps with 20 products in flight at 1280×800 on an M-series laptop.
- No inline `style=` in React. HUD styling lives in `app/globals.css` (the repo has no Tailwind).

## Review Focus

1. **Look switch mid-production.** A product half-poured (molten, partly filled) must keep its fill and heat after switching look. No material leaks. Pinned in Task 10 (`restyle preserves state`).
2. **Typing faster than the line.** 30+ queued jobs must not pile up visibly at station 0: queued jobs are hidden. Pinned in Task 9 (`queued jobs are invisible`).
3. **Backspace on a product inside a station.** The handle is disposed, and next frame the station gets `job = null` and returns to idle without throwing. Pinned in Task 9 (host) and Task 11 (stations get a null update after a job).
4. **Tab hidden / long frame.** The loop clamps `dt` to 0.1 s, sleeps when hidden, and resumes with `dt = 0`. Pinned in Task 6 (loop tests).
5. **Space and unknown characters.** A space job is a bare pallet that never throws in any stage. `~` (not in the glyph set) renders as `?`. Pinned in Task 5 (`letterGeometry` fallback) and Task 10 (space handle).

---

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `engine/types.ts` | modify | + `letter` kind, `Look`, `Pace`, `Quality`, `LOOKS`, `PACES` |
| `engine/settings.ts` | modify | + `look`, `pace`, `quality`; default product `letter` |
| `lib/share.ts` | modify | validators for the new settings |
| `engine/pace.ts` | create | `paceParams(pace)` |
| `engine/director.ts` | modify | pace-aware `speedMul`; applies `maxInFlight` to lines |
| `engine/line.ts` | modify | `opts.minGap`, `maxInFlight`, `CONVEYOR_SPEED = 80` |
| `engine/layout.ts` | modify | rows toward −y, return conveyor behind (+y), shelf in front |
| `engine/letterSolid.ts` | create | `letterGeometry(ch, {height, radius})`, cached thick-stroke letter |
| `factories/shared/ik.ts` | create | `solveArm` / `forwardArm`, analytic 2-bone IK |
| `engine/surface.ts` | modify | drop `glyphPaths`/`facesCamera`/`visible`; viewer at −y |
| `engine/looks.ts` | create | role tables for 4 looks, `part`, `own`, `apply`, `appearance`, belt texture, particle colours |
| `engine/renderer.ts` | create | `WebGLRenderer` + scene + resize + quality |
| `engine/stage.ts` | create | lights, environment, background, tone mapping, shadow fit |
| `engine/loop.ts` | rewrite | single rAF loop with dt clamp and sleep |
| `engine/particles.ts` | modify | drop canvas draw; export `ColorKey`, `specOf`, read-only buffers |
| `engine/particlesView.ts` | create | pooled `THREE.Points` (normal + additive) |
| `engine/edgePass.ts` | create | depth+normal Sobel line-art pass |
| `engine/post.ts` | create | composer chains per look/quality |
| `engine/camera.ts` | rewrite | `CameraRig`: persp/ortho per look, modes, orbit override, `fitView` |
| `factories/shared/dims.ts` | create | `BELT_TOP`, `BELT_W` |
| `factories/shared/parts.ts` | create | procedural parts kit |
| `factories/shared/conveyor.ts` | create | belt conveyors along layout paths |
| `factories/shared/robotArm.ts` | create | 6-axis arm on IK |
| `engine/station.ts`, `engine/product.ts`, `engine/factory.ts` | rewrite | 3D contracts |
| `engine/factoryHost.ts` | rewrite | mounts a factory in 3D |
| `shelf/view.ts` | rewrite | 3D typewriter shelf |
| `hud/Hud.tsx` | create | minimal HUD (look, pace, camera, theme, quality, sound) |
| `components/Scene.tsx` | rewrite | wires everything |
| `components/Bench.tsx`, `app/dev/bench/page.tsx` | create | dev bench for visual review |
| `factories/letter/visual.ts` | create | pure `letterVisual(stage, t)` |
| `factories/letter/product.ts` | create | `letterProduct` model + handle |
| `factories/letter/stations/{moulder,pour,cooling,shakeout,grinder,polish,robot}.ts` | create | one station each |
| `factories/letter/index.ts` | create | `letterFactory` |
| `factories/registry.ts` | modify | registers `letter` |
| **deleted** | | `lib/hl.ts`, `lib/hl.node.ts`, `lib/hl.test.ts`, `public/hairline/`, `engine/world.ts`, `engine/productView.ts`, `engine/palette.ts`, `factories/demo/`, old `engine/camera.test.ts` |

---

### Task 5: Pure groundwork (deps, settings, pace, line, layout, letter solid, IK)

**Files:**
- Modify: `package.json`, `engine/types.ts`, `engine/settings.ts`, `lib/share.ts`, `engine/director.ts`, `engine/line.ts`, `engine/layout.ts`
- Create: `engine/pace.ts`, `engine/letterSolid.ts`, `factories/shared/ik.ts`
- Test: `engine/pace.test.ts`, `engine/letterSolid.test.ts`, `factories/shared/ik.test.ts`; extend `engine/line.test.ts`, `engine/director.test.ts`, `engine/layout.test.ts`, `engine/settings.test.ts`, `lib/share.test.ts`

**Interfaces:**
- Consumes: `glyph(ch)` from `engine/glyphs.ts`; `CHARSET` from `engine/charset.ts`.
- Produces:
  - `Look`, `Pace`, `Quality`, `LOOKS`, `PACES`
  - `ProductKind` now includes `'letter'` (first in `PRODUCT_KINDS`)
  - `Settings.look | pace | quality`
  - `paceParams(p): PaceParams`
  - `Line` ctor 5th arg `{ minGap?: number }`, plus `line.maxInFlight: number`
  - `letterGeometry(ch, {height, radius}): THREE.BufferGeometry`
  - `ArmDims`, `ArmPose`, `solveArm(target, dims)`, `forwardArm(pose, dims)`

- [ ] **Step 1: Add dependencies**

```bash
pnpm add three@0.186.1 && pnpm add -D @types/three@0.186.0
```

- [ ] **Step 2: Types and settings.** In `engine/types.ts`:

```ts
export type ProductKind = 'letter' | 'bottle' | 'can' | 'mug' | 'cookie' | 'neon' | 'brick';
export type Look = 'realistic' | 'lineart' | 'flat' | 'cutaway';
export type Pace = 'auto' | 'fast' | 'detailed' | 'cinematic';
export type Quality = 'low' | 'high';
export const PRODUCT_KINDS: readonly ProductKind[] = ['letter', 'bottle', 'can', 'mug', 'cookie', 'neon', 'brick'];
export const LOOKS: readonly Look[] = ['realistic', 'lineart', 'flat', 'cutaway'];
export const PACES: readonly Pace[] = ['auto', 'fast', 'detailed', 'cinematic'];
```

In `engine/settings.ts`:
- Import `Look, Pace, Quality`.
- Add to `Settings`: `look: Look; pace: Pace; quality: Quality;`.
- Add to `defaultSettings`: `look: 'realistic', pace: 'auto', quality: 'high'`, and change `product: 'letter'`.

In `lib/share.ts` validators add:

```ts
  look: oneOf('realistic', 'lineart', 'flat', 'cutaway'),
  pace: oneOf('auto', 'fast', 'detailed', 'cinematic'),
  quality: oneOf('low', 'high'),
```

If `engine/director.test.ts` relies on `defaultSettings.product === 'bottle'`, make its fixture set `product: 'bottle'` explicitly. Do not change the assertions.

- [ ] **Step 3: Write failing tests for pace + director**

`engine/pace.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FAST_MUL, paceParams } from './pace';
import { PACES } from './types';

describe('paceParams', () => {
  it('auto follows WPM; others pin speed', () => {
    expect(paceParams('auto')).toEqual({ wpm: true, speedMul: 1, maxInFlight: Infinity, lockFollow: false });
    expect(paceParams('fast').speedMul).toBeCloseTo(1 / 0.35, 9);
    expect(FAST_MUL).toBeCloseTo(1 / 0.35, 9);
    expect(paceParams('detailed')).toEqual({ wpm: false, speedMul: 1, maxInFlight: Infinity, lockFollow: false });
    expect(paceParams('cinematic')).toEqual({ wpm: false, speedMul: 1, maxInFlight: 1, lockFollow: true });
  });
  it('covers every pace', () => {
    for (const p of PACES) expect(paceParams(p)).toBeDefined();
  });
});
```

Append to `engine/director.test.ts` (self-contained block):

```ts
import { Line } from './line';
import { defaultSettings, type Settings } from './settings';
import type { StationDef } from './station';

describe('Director pace', () => {
  const st: StationDef = { id: 'a', label: 'a', footprint: [40, 40], height: 10, duration: 1, create: () => { throw new Error('unused'); } };
  it('speedMul follows pace', () => {
    const s: Settings = { ...defaultSettings, pace: 'fast' };
    const d = new Director({ settings: () => s, now: () => 0 });
    expect(d.speedMul(0)).toBeCloseTo(1 / 0.35, 9);
    s.pace = 'detailed';
    expect(d.speedMul(0)).toBe(1);
    s.pace = 'cinematic';
    expect(d.speedMul(0)).toBe(1);
  });
  it('update applies maxInFlight to every attached line', () => {
    const s: Settings = { ...defaultSettings, pace: 'cinematic' };
    const d = new Director({ settings: () => s, now: () => 0 });
    const line = new Line([st], [[0, 0, 0]], []);
    d.attach('letter', { line, firstStage: 'flask', slotPos: () => null });
    d.update(0.01);
    expect(line.maxInFlight).toBe(1);
    s.pace = 'auto';
    d.update(0.01);
    expect(line.maxInFlight).toBe(Infinity);
  });
});
```

(Merge the imports with the file's existing ones.)

- [ ] **Step 4: Run them; expect failures.** `pnpm vitest run engine/pace.test.ts engine/director.test.ts` should report `Cannot find module './pace'` or similar.

- [ ] **Step 5: Implement `engine/pace.ts`**

```ts
import type { Pace } from './types';

export interface PaceParams {
  /** speed follows typing WPM (Clock.speedMul) */
  wpm: boolean;
  /** fixed sim speed multiplier when !wpm */
  speedMul: number;
  /** jobs allowed past the queue at once */
  maxInFlight: number;
  /** camera locked to follow mode */
  lockFollow: boolean;
}

export const FAST_MUL = 1 / 0.35;

export function paceParams(p: Pace): PaceParams {
  switch (p) {
    case 'auto': return { wpm: true, speedMul: 1, maxInFlight: Infinity, lockFollow: false };
    case 'fast': return { wpm: false, speedMul: FAST_MUL, maxInFlight: Infinity, lockFollow: false };
    case 'detailed': return { wpm: false, speedMul: 1, maxInFlight: Infinity, lockFollow: false };
    case 'cinematic': return { wpm: false, speedMul: 1, maxInFlight: 1, lockFollow: true };
  }
}
```

In `engine/director.ts`:
- Import `paceParams`.
- Replace `speedMul`:

```ts
  speedMul(now: number): number {
    const p = paceParams(this.o.settings().pace);
    return p.wpm ? this.clock.speedMul(now) : p.speedMul;
  }
```

- At the top of `update(simDt)`, before ticking lines:

```ts
    const maxInFlight = paceParams(this.o.settings().pace).maxInFlight;
    for (const h of this.hosts.values()) h.line.maxInFlight = maxInFlight;
```

- [ ] **Step 6: Failing tests for Line options.** Append to `engine/line.test.ts`:

```ts
describe('Line options', () => {
  const st = (id: string, duration = 0.5): StationDef => ({ id, label: id, footprint: [40, 40], height: 20, duration, create: () => { throw new Error('unused'); } });
  const mk = (id: number): Job => ({ id, slotId: id, char: 'a', isSpace: false, special: 'none', product: 'letter', stage: 's', phase: 'queued', stationIndex: -1, progress: 0, pos: [0, 0, 0], defect: false, retries: 0 });

  it('maxInFlight = 1 keeps later jobs queued until the first leaves', () => {
    const line = new Line([st('a'), st('b')], [[0, 0, 0], [100, 0, 0]], [[[0, 0, 0], [100, 0, 0]]]);
    line.maxInFlight = 1;
    let left = 0;
    line.onPhase((j) => { if (j.phase === 'placing') left++; });
    for (let i = 1; i <= 3; i++) line.enqueue(mk(i));
    for (let k = 0; k < 4000 && left < 3; k++) {
      line.tick(0.01);
      expect(line.jobs.filter((j) => j.phase !== 'queued').length).toBeLessThanOrEqual(1);
    }
    expect(left).toBe(3);
  });

  it('minGap option overrides MIN_GAP on conveyors', () => {
    const line = new Line([st('a', 0), st('b', 100)], [[0, 0, 0], [400, 0, 0]], [[[0, 0, 0], [400, 0, 0]]], () => 'pass', { minGap: 50 });
    for (let i = 1; i <= 4; i++) line.enqueue(mk(i));
    for (let k = 0; k < 3000; k++) line.tick(0.01);
    const xs = line.jobs.filter((j) => j.phase === 'conveyor').map((j) => j.pos[0]).sort((a, b) => b - a);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < xs.length; i++) expect(xs[i - 1] - xs[i]).toBeGreaterThanOrEqual(50 - 1e-9);
  });
});
```

(Import `StationDef` and `Job` types if they aren't already.)

- [ ] **Step 7: Implement Line options.** In `engine/line.ts`:
- `export const CONVEYOR_SPEED = 80;` (3D stations are about 2× wider).
- Add `export interface LineOptions { minGap?: number }`.
- Constructor gains a 5th parameter `opts: LineOptions = {}`, stored as `private minGap = opts.minGap ?? MIN_GAP`.
- Add the public field `maxInFlight = Infinity;`.
- In `updateStation` and `updateConveyor`, replace both `MIN_GAP` uses with `this.minGap`.
- `intake()` becomes:

```ts
  private intake(): void {
    if (this.occupant[0] || this.queue.length === 0) return;
    if (this.jobs.length - this.queue.length >= this.maxInFlight) return;
    this.enterStation(0, this.queue.shift()!, 'queued');
  }
```

- [ ] **Step 8: Layout faces the viewer at −y.** In `engine/layout.ts`:
- `export const RETURN_Y = 80;` (the return conveyor runs *behind* the line).
- Anchors: `[ox + colX[c.col], oy - c.row * rowPitch, oz + c.floor * FLOOR_STEP]`.
- `shelfOrigin: [min[0], min[1] - SHELF_FRONT, 0]`.
- Update the doc comments ("stacked along −y", "return conveyor at y = +80 behind the line").

In `engine/layout.test.ts` update exactly these expectations:
- Shelf: `toEqual([r.bounds.min[0], r.bounds.min[1] - 160, 0])`.
- Snake: `expect(a[1]).toBe(-Math.floor(i / PER_ROW) * pitch)`.
- Stacked: the existing check uses `RETURN_Y` (now 80), so keep it importing the constant.
- 'all': `expect(r.anchors[5][1]).toBeLessThan(r.anchors[0][1])`.
- Rename any test title that says "+y" to "−y".

- [ ] **Step 9: Failing tests for `letterGeometry`.** `engine/letterSolid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHARSET } from './charset';
import { letterGeometry } from './letterSolid';

const O = { height: 26, radius: 2.3 };

describe('letterGeometry', () => {
  it('keeps the glyph cell z (R2), centred on x, thickness ±radius', () => {
    for (const ch of CHARSET) {
      const g = letterGeometry(ch, O);
      const bb = g.boundingBox!;
      expect(g.getAttribute('position').count, ch).toBeGreaterThan(0);
      expect(bb.min.z, ch).toBeGreaterThanOrEqual(-O.radius - 1e-6);
      expect(bb.max.z, ch).toBeLessThanOrEqual(O.height + O.radius + 1e-6);
      expect(bb.min.x + bb.max.x, ch).toBeCloseTo(0, 6);
      expect(bb.max.x - bb.min.x, ch).toBeLessThanOrEqual(0.7 * O.height + 2 * O.radius + 1e-6);
      expect(bb.min.y, ch).toBeGreaterThanOrEqual(-O.radius - 1e-6);
      expect(bb.max.y, ch).toBeLessThanOrEqual(O.radius + 1e-6);
    }
  });
  it('caches per char and size', () => {
    expect(letterGeometry('A', O)).toBe(letterGeometry('A', O));
    expect(letterGeometry('A', { height: 20, radius: 2.3 })).not.toBe(letterGeometry('A', O));
  });
  it('unknown characters render as ?', () => {
    expect(letterGeometry('~', O).getAttribute('position').count).toBe(letterGeometry('?', O).getAttribute('position').count);
  });
});
```

- [ ] **Step 10: Implement `engine/letterSolid.ts`**

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glyph } from './glyphs';

export interface LetterSolidOpts { height: number; radius: number }

const cache = new Map<string, THREE.BufferGeometry>();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Thick-stroke letter built from the single-stroke glyph: a cylinder per segment plus a sphere at every
 * stroke point, merged into one geometry. Upright in the x/z plane, reading +x, facing −y (thickness
 * along y). Cell kept: z = (1 − v)·height, baseline at (1 − GLYPH_BASE)·height (ruling R2); x-extent centred on 0. Cached per (char, height, radius) —
 * callers must NOT dispose it.
 */
export function letterGeometry(ch: string, o: LetterSolidOpts): THREE.BufferGeometry {
  const key = `${ch}|${o.height}|${o.radius}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  for (const stroke of glyph(ch)) {
    const pts = stroke.map(([u, v]) => new THREE.Vector3(u * o.height, 0, (1 - v) * o.height));
    for (const p of pts) parts.push(new THREE.SphereGeometry(o.radius, 10, 6).translate(p.x, p.y, p.z));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = a.distanceTo(b);
      if (len < 1e-6) continue;
      const g = new THREE.CylinderGeometry(o.radius, o.radius, len, 10, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
      const m = a.clone().add(b).multiplyScalar(0.5);
      parts.push(g.translate(m.x, m.y, m.z));
    }
  }
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  merged.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  cache.set(key, merged);
  return merged;
}
```

- [ ] **Step 11: Failing tests for IK.** `factories/shared/ik.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { forwardArm, solveArm, type ArmDims } from './ik';
import type { Vec3 } from '../../engine/types';

const D: ArmDims = { shoulderZ: 60, upper: 100, fore: 95 };

describe('solveArm', () => {
  it('reaches reachable targets (forward(solve(t)) = t)', () => {
    const targets: Vec3[] = [[120, 0, 60], [0, 90, 20], [-60, -80, 150], [30, 30, 100], [150, 40, 30]];
    for (const t of targets) {
      const p = solveArm(t, D);
      expect(p.reach).toBe(true);
      const w = forwardArm(p, D);
      for (let i = 0; i < 3; i++) expect(w[i]).toBeCloseTo(t[i], 6);
    }
  });
  it('clamps unreachable targets to full stretch along the target direction', () => {
    const p = solveArm([400, 0, 60], D);
    expect(p.reach).toBe(false);
    const w = forwardArm(p, D);
    expect(Math.hypot(w[0], w[1], w[2] - D.shoulderZ)).toBeCloseTo(D.upper + D.fore - 1e-3, 2);
    expect(w[1]).toBeCloseTo(0, 6);
  });
  it('elbow bends upward (elbow-up solution)', () => {
    const p = solveArm([100, 0, 60], D);
    expect(p.elbow).toBeGreaterThan(0);
    expect(p.shoulder).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 12: Implement `factories/shared/ik.ts`**

```ts
import type { Vec3 } from '../../engine/types';

export interface ArmDims { shoulderZ: number; upper: number; fore: number }
/** yaw about z; shoulder = upper-arm elevation from horizontal; elbow = bend (0 = straight, >0 bends down). */
export interface ArmPose { yaw: number; shoulder: number; elbow: number; reach: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Analytic 2-bone IK, elbow-up. `t` = wrist point relative to the arm base (base at z = 0). */
export function solveArm(t: Vec3, d: ArmDims): ArmPose {
  const yaw = Math.atan2(t[1], t[0]);
  const r = Math.hypot(t[0], t[1]);
  const h = t[2] - d.shoulderZ;
  const want = Math.hypot(r, h);
  const lo = Math.abs(d.upper - d.fore) + 1e-3;
  const hi = d.upper + d.fore - 1e-3;
  const L = clamp(want, lo, hi);
  const reach = want >= lo && want <= hi;
  const inner = Math.acos(clamp((d.upper ** 2 + d.fore ** 2 - L ** 2) / (2 * d.upper * d.fore), -1, 1));
  const elbow = Math.PI - inner;
  const shoulder = Math.atan2(h, r) + Math.acos(clamp((d.upper ** 2 + L ** 2 - d.fore ** 2) / (2 * d.upper * L), -1, 1));
  return { yaw, shoulder, elbow, reach };
}

/** Wrist point of a pose (inverse of solveArm for reachable targets). */
export function forwardArm(p: ArmPose, d: ArmDims): Vec3 {
  const er = Math.cos(p.shoulder) * d.upper;
  const eh = Math.sin(p.shoulder) * d.upper;
  const a = p.shoulder - p.elbow;
  const r = er + Math.cos(a) * d.fore;
  const h = eh + Math.sin(a) * d.fore;
  return [r * Math.cos(p.yaw), r * Math.sin(p.yaw), d.shoulderZ + h];
}
```

- [ ] **Step 13: Settings and share tests.**
- In `engine/settings.test.ts`, assert the defaults `look: 'realistic'`, `pace: 'auto'`, `quality: 'high'`, `product: 'letter'`, `sound: false`.
- In `lib/share.test.ts`, add one round-trip test with `{ look: 'cutaway', pace: 'cinematic', quality: 'low' }`, plus a rejection test for `{ look: 'neon' }` (decode returns `null`).

- [ ] **Step 14: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`. Expected: all green.

```bash
git add -A && git commit -m "feat(engine): pace, line options, -y layout, letter solid, arm IK"
```

---

### Task 6: Three runtime swap (renderer, stage, looks, loop, particles view, bench)

**Files:**
- Delete:
  - `lib/hl.ts`, `lib/hl.node.ts`, `lib/hl.test.ts`, `public/hairline/` (whole dir)
  - `engine/world.ts`, `engine/productView.ts`, `engine/palette.ts`
  - `engine/camera.ts`, `engine/camera.test.ts` (rewritten in Task 7)
  - `engine/factoryHost.ts`, `shelf/view.ts` (rewritten in Task 9)
  - `factories/demo/`
- Modify:
  - `factories/registry.ts`: `FACTORIES = {}` for now, keep `factoryOrigin`
  - `engine/surface.ts` + `engine/surface.test.ts`
  - `engine/particles.ts` + `engine/particles.test.ts`
  - `engine/station.ts` / `engine/product.ts` / `engine/factory.ts`: replace their bodies with the Task 9 contracts *now*, so nothing references deleted SVG types. Copy the three code blocks from Task 9 Step 1 verbatim.
  - `app/layout.tsx`, `app/globals.css`, `components/Scene.tsx`
- Create: `engine/looks.ts`, `engine/renderer.ts`, `engine/stage.ts`, `engine/loop.ts` (rewrite), `engine/particlesView.ts`, `components/Bench.tsx`, `app/dev/bench/page.tsx`
- Test: `engine/looks.test.ts`, `engine/loop.test.ts`, `engine/particlesView.test.ts`, updated `engine/surface.test.ts`

**Interfaces:**
- Consumes: Task 5 types and settings.
- Produces:
  - `MATERIAL_ROLES`, `MaterialRole`, `LookOptions`
  - `class Looks`, with members:
    - `opts`, `set(o)`, `material(role)`, `part(geom, role, shadows?)`, `own(role)`
    - `apply(root)`, `appearance(mat, a)`
    - `background()`, `edgeColor()`, `particleColor(key)`
    - `beltTexture`, `scrollBelts(dist)`, `dispose()`
  - `createRenderer(root, quality): Renderer`
  - `createStage(gl, scene): Stage`
  - `createLoop(speedMul, env?)`
  - `ParticlesView`, `PARTICLE_LAYER = 1`
  - `ColorKey`, `specOf`

- [ ] **Step 1: Delete the Hairline/SVG runtime**

```bash
git rm -r -q lib/hl.ts lib/hl.node.ts lib/hl.test.ts public/hairline engine/world.ts engine/productView.ts engine/palette.ts engine/camera.ts engine/camera.test.ts engine/factoryHost.ts shelf/view.ts factories/demo
```

- `factories/registry.ts`: remove the demo import and set `export const FACTORIES: Partial<Record<ProductKind, FactoryDef>> = {};`. Keep `FACTORY_SPACING` and `factoryOrigin`.
- `app/layout.tsx`: remove the `Script` import and element. Set the description to `'Every typed letter runs an animated 3D factory.'`.
- `app/globals.css`: delete every `[data-hairline]`/`acc-*` rule and the `:root` accent vars. Keep the reset and `html, body` block, then add:

```css
.stage { position: fixed; inset: 0; }
.stage canvas { display: block; width: 100%; height: 100%; }
```

- [ ] **Step 2: Surface without SVG.** In `engine/surface.ts`:
- Delete `glyphPaths`, `GlyphPathOpts`, `r2`, `MAX_STEP`, `Project`, `facesCamera` and `CAM_AZ`.
- Remove `visible` from `Surface`, which becomes `{ at(u, v): Vec3; curved: boolean }`.
- Add `export const FRONT_ANGLE = -Math.PI / 2; // surfaces face the viewer at −y`.
- `cylinderSurface` defaults `facingAngle = FRONT_ANGLE`, with angle `facingAngle + (u - 0.5) * arc` (screen-right is +x for a viewer at −y).
- `topSurface` reads +x with the top toward +y: `flatSurface([c[0] - w / 2, c[1] + h / 2, c[2]], [1, 0, 0], [0, -1, 0], [w, h])`.

In `engine/surface.test.ts`:
- Delete the `facesCamera` and `glyphPaths` describes.
- Keep the `flatSurface` tests.
- Rewrite the cylinder and top tests:
  - `cylinderSurface([0,0,0], 10, 0, 20).at(0.5, 0)` is close to `[0, -10, 20]`.
  - `at(1, 0)[0] > at(0, 0)[0]` (reads +x).
  - `topSurface([0,0,5], 10)`: `at(0,0)[1] > at(0,1)[1]` (top is far, at +y), and `at(1,0)[0] > at(0,0)[0]`.

- [ ] **Step 3: Particles sim only.** In `engine/particles.ts`:
- Remove the `Palette` import, `ScreenMapper` and `draw()`.
- Add `export type ColorKey = 'mid' | 'hi' | 'edge' | 'molten' | 'drink' | 'neon' | 'flash' | 'glass' | 'label';`.
- Export `KindSpec`.
- Make the buffers public read-only: `readonly kind`, `col`, `p`, `v`, `age`, `life`, `size`. Keep the names.
- Add:

```ts
/** Spec of a particle kind by its index in PARTICLE_KINDS. */
export function specOf(kindIndex: number): Readonly<KindSpec> {
  return SPECS[PARTICLE_KINDS[kindIndex]];
}
```

Existing particle tests must still pass unchanged.

- [ ] **Step 4: Failing tests for Looks.** `engine/looks.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks, MATERIAL_ROLES, type LookOptions } from './looks';
import { LOOKS } from './types';

const base: LookOptions = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' };

describe('Looks', () => {
  it('has a material for every role in every look', () => {
    for (const look of LOOKS) {
      const l = new Looks({ ...base, look });
      for (const role of MATERIAL_ROLES) expect(l.material(role), `${look}/${role}`).toBeInstanceOf(THREE.Material);
      l.dispose();
    }
  });
  it('shares one material per role and look', () => {
    const l = new Looks(base);
    expect(l.material('steel')).toBe(l.material('steel'));
    expect(l.own('product')).not.toBe(l.own('product'));
  });
  it('part tags role and swaps material on apply', () => {
    const l = new Looks(base);
    const m = l.part(new THREE.BoxGeometry(1, 1, 1), 'paint');
    const root = new THREE.Group().add(m);
    expect(m.userData.role).toBe('paint');
    const before = m.material;
    l.set({ ...base, look: 'flat' });
    l.apply(root);
    expect(m.material).not.toBe(before);
    expect(m.material).toBe(l.material('paint'));
  });
  it('apply skips meshes without a role (own materials)', () => {
    const l = new Looks(base);
    const own = l.own('product');
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), own);
    l.set({ ...base, look: 'lineart' });
    l.apply(new THREE.Group().add(m));
    expect(m.material).toBe(own);
  });
  it('cutaway materials are double-sided; lineart non-hot roles use the background colour', () => {
    const c = new Looks({ ...base, look: 'cutaway' });
    expect(c.material('paint').side).toBe(THREE.DoubleSide);
    const la = new Looks({ ...base, look: 'lineart' });
    const bg = la.background();
    expect((la.material('steel') as THREE.MeshBasicMaterial).color.equals(bg)).toBe(true);
    expect((la.material('molten') as THREE.MeshBasicMaterial).color.equals(bg)).toBe(false);
  });
  it('mono maps paint-accent to the paint colour', () => {
    const l = new Looks({ ...base, colorMode: 'mono' });
    const a = l.material('paint-accent') as THREE.MeshStandardMaterial;
    const p = l.material('paint') as THREE.MeshStandardMaterial;
    expect(a.color.equals(p.color)).toBe(true);
  });
  it('appearance applies heat to emissive-capable materials and to lineart basic', () => {
    for (const look of LOOKS) {
      const l = new Looks({ ...base, look });
      const m = l.own('product');
      expect(() => l.appearance(m, { color: new THREE.Color(0x444444), emissive: new THREE.Color(0xff6a10), emissiveIntensity: 3, metalness: 0.5, roughness: 0.8 })).not.toThrow();
    }
  });
});
```

- [ ] **Step 5: Implement `engine/looks.ts`**

```ts
import * as THREE from 'three';
import type { ColorKey } from './particles';
import type { Look, Quality } from './types';

export const MATERIAL_ROLES = [
  'steel', 'paint', 'paint-accent', 'rubber', 'belt', 'copper', 'glass', 'molten', 'liquid',
  'wood', 'concrete', 'sand', 'product', 'glow',
] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

export interface LookOptions { look: Look; theme: 'light' | 'dark'; colorMode: 'accent' | 'mono'; quality: Quality }
export interface Appearance { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; metalness: number; roughness: number }

interface RoleSpec { color: number; metal: number; rough: number; emissive?: number; emissiveIntensity?: number; basic?: boolean; transmission?: number }

const SPEC: Record<MaterialRole, RoleSpec> = {
  steel: { color: 0x8c929a, metal: 0.85, rough: 0.35 },
  paint: { color: 0x2f4f63, metal: 0.25, rough: 0.55 },
  'paint-accent': { color: 0xe3a817, metal: 0.15, rough: 0.5 },
  rubber: { color: 0x1a1b1d, metal: 0, rough: 0.9 },
  belt: { color: 0x2a2b2e, metal: 0, rough: 0.85 },
  copper: { color: 0xb8683a, metal: 0.9, rough: 0.3 },
  glass: { color: 0xdff5ef, metal: 0, rough: 0.05, transmission: 0.92 },
  molten: { color: 0xff7a1a, metal: 0, rough: 0.6, emissive: 0xff5a00, emissiveIntensity: 3 },
  liquid: { color: 0x7fb7c9, metal: 0.1, rough: 0.08 },
  wood: { color: 0x9a6b3f, metal: 0, rough: 0.75 },
  concrete: { color: 0x5d5f62, metal: 0, rough: 0.95 },
  sand: { color: 0xb59767, metal: 0, rough: 1 },
  product: { color: 0x45474b, metal: 0.55, rough: 0.85 },
  glow: { color: 0xffd27a, metal: 0, rough: 1, basic: true },
};
/** Roles recoloured in colorMode 'mono'. */
const MONO: Partial<Record<MaterialRole, number>> = { 'paint-accent': SPEC.paint.color, copper: SPEC.steel.color };
const HOT = new Set<MaterialRole>(['molten', 'glow']);

const BG: Record<Look, Record<'light' | 'dark', number>> = {
  realistic: { dark: 0x0d0f12, light: 0xdcdfe3 },
  cutaway: { dark: 0x0d0f12, light: 0xdcdfe3 },
  flat: { dark: 0x1a1d22, light: 0xeae6dd },
  lineart: { dark: 0x0b0c0e, light: 0xf3f1ec },
};
const EDGE: Record<'light' | 'dark', number> = { dark: 0xd9dce0, light: 0x1c1e21 };
const PARTICLE: Record<ColorKey, number> = {
  mid: 0x9aa0a6, hi: 0xf2f2f2, edge: 0x5a5f66, molten: 0xff7a1a, drink: 0x3a1a0e,
  neon: 0xff3df0, flash: 0xfff4c2, glass: 0x9fd8c8, label: 0xd92b2b,
};

let toonRamp: THREE.DataTexture | null = null;
function ramp(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  toonRamp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/** Darkens back faces so cut-open hollow parts read as section cuts. */
function tintBackFaces(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor.rgb *= 0.35;',
  );
}

export const BELT_STRIPE = 16; // world units per stripe period on belts

/**
 * The look system (Global Constraint: materials only from here). A look = role → shared material.
 * Per-instance animated materials come from `own(role)`; meshes using them carry no `userData.role`
 * and are restyled by their owner.
 */
export class Looks {
  readonly beltTexture: THREE.DataTexture;
  private o: LookOptions;
  private table = new Map<MaterialRole, THREE.Material>();

  constructor(o: LookOptions) {
    this.o = o;
    const px = new Uint8Array(4 * 8);
    for (let i = 0; i < 8; i++) px.set(i < 2 ? [70, 72, 76, 255] : [40, 41, 44, 255], i * 4);
    this.beltTexture = new THREE.DataTexture(px, 8, 1, THREE.RGBAFormat);
    this.beltTexture.wrapS = this.beltTexture.wrapT = THREE.RepeatWrapping;
    this.beltTexture.colorSpace = THREE.SRGBColorSpace;
    this.beltTexture.needsUpdate = true;
  }

  get opts(): LookOptions { return this.o; }

  set(o: LookOptions): void {
    for (const m of this.table.values()) m.dispose();
    this.table.clear();
    this.o = o;
  }

  material(role: MaterialRole): THREE.Material {
    let m = this.table.get(role);
    if (!m) this.table.set(role, (m = this.make(role)));
    return m;
  }

  /** Fresh per-instance material for animated parts; the caller disposes it. */
  own(role: MaterialRole): THREE.Material {
    return this.make(role);
  }

  part<G extends THREE.BufferGeometry>(geom: G, role: MaterialRole, shadows = true): THREE.Mesh<G, THREE.Material> {
    const m = new THREE.Mesh(geom, this.material(role));
    m.userData.role = role;
    m.castShadow = shadows && !HOT.has(role);
    m.receiveShadow = shadows;
    return m;
  }

  /** Swap every role-tagged mesh under `root` to the current look's material. */
  apply(root: THREE.Object3D): void {
    root.traverse((o) => {
      const role = o.userData.role as MaterialRole | undefined;
      if (role && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.material(role);
    });
  }

  /** Set an own() material's appearance in whatever way the current look supports. */
  appearance(mat: THREE.Material, a: Appearance): void {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.color.copy(a.color);
      mat.emissive.copy(a.emissive);
      mat.emissiveIntensity = a.emissiveIntensity;
      mat.metalness = a.metalness;
      mat.roughness = a.roughness;
    } else if (mat instanceof THREE.MeshToonMaterial) {
      mat.color.copy(a.color).lerp(new THREE.Color(0xffffff), a.metalness * 0.3);
      mat.emissive.copy(a.emissive);
      mat.emissiveIntensity = Math.min(1, a.emissiveIntensity / 3);
    } else if (mat instanceof THREE.MeshBasicMaterial) {
      const hot = Math.min(1, a.emissiveIntensity / 3);
      mat.color.copy(this.o.look === 'lineart' ? this.background() : a.color).lerp(a.emissive, hot);
    }
  }

  background(): THREE.Color { return new THREE.Color(BG[this.o.look][this.o.theme]); }
  edgeColor(): THREE.Color { return new THREE.Color(EDGE[this.o.theme]); }
  particleColor(k: ColorKey): THREE.Color { return new THREE.Color(PARTICLE[k]); }

  /** Advance every belt's stripes by `dist` world units (all belts share one speed). */
  scrollBelts(dist: number): void {
    this.beltTexture.offset.x = (this.beltTexture.offset.x - dist / BELT_STRIPE) % 1;
  }

  dispose(): void {
    for (const m of this.table.values()) m.dispose();
    this.table.clear();
    this.beltTexture.dispose();
  }

  private make(role: MaterialRole): THREE.Material {
    const { look, colorMode, quality } = this.o;
    const s = SPEC[role];
    const color = new THREE.Color(colorMode === 'mono' ? MONO[role] ?? s.color : s.color);
    const map = role === 'belt' ? this.beltTexture : null;
    if (look === 'lineart') {
      return new THREE.MeshBasicMaterial({ color: HOT.has(role) ? color : this.background(), toneMapped: false });
    }
    if (s.basic) return new THREE.MeshBasicMaterial({ color, toneMapped: false });
    if (look === 'flat') {
      return new THREE.MeshToonMaterial({
        color, map, gradientMap: ramp(),
        emissive: s.emissive ?? 0x000000, emissiveIntensity: s.emissive ? 1 : 0,
        transparent: role === 'glass', opacity: role === 'glass' ? 0.4 : 1,
      });
    }
    const glass = role === 'glass';
    const m = glass && quality === 'high'
      ? new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: s.rough, transmission: s.transmission ?? 0.9, thickness: 1.5, ior: 1.5 })
      : new THREE.MeshStandardMaterial({
        color, map, metalness: s.metal, roughness: s.rough,
        emissive: s.emissive ?? 0x000000, emissiveIntensity: s.emissiveIntensity ?? 0,
        transparent: glass, opacity: glass ? 0.35 : 1,
      });
    if (look === 'cutaway') {
      m.side = THREE.DoubleSide;
      m.onBeforeCompile = tintBackFaces;
      m.customProgramCacheKey = () => 'cutaway-backface';
    }
    return m;
  }
}
```

- [ ] **Step 6: Renderer and stage.** `engine/renderer.ts`:

```ts
import * as THREE from 'three';
import type { Quality } from './types';

export interface Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  size(): { w: number; h: number };
  setQuality(q: Quality): void;
  resize(): void;
  dispose(): void;
}

/** One WebGL canvas filling `root`. Pixel ratio capped at 2 (1 on low quality); shadows off on low. */
export function createRenderer(root: HTMLElement, quality: Quality): Renderer {
  const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.localClippingEnabled = true;
  root.appendChild(gl.domElement);
  const scene = new THREE.Scene();
  let w = 1;
  let h = 1;
  const quality_ = (q: Quality) => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1));
    gl.shadowMap.enabled = q === 'high';
  };
  const resize = () => {
    w = Math.max(1, root.clientWidth);
    h = Math.max(1, root.clientHeight);
    gl.setSize(w, h);
  };
  quality_(quality);
  resize();
  return {
    gl, scene,
    size: () => ({ w, h }),
    setQuality: (q) => { quality_(q); resize(); },
    resize,
    dispose: () => { gl.dispose(); gl.domElement.remove(); },
  };
}
```

`engine/stage.ts`:

```ts
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Looks } from './looks';
import type { Vec3 } from './types';

export interface Stage {
  setLook(looks: Looks): void;
  /** Fit the sun's shadow camera around a world box. */
  fitShadow(min: Vec3, max: Vec3): void;
  dispose(): void;
}

const SUN_DIR = new THREE.Vector3(-0.45, -0.6, 1).normalize(); // high, from front-left

/** Lights, environment map, background and tone mapping per look. */
export function createStage(gl: THREE.WebGLRenderer, scene: THREE.Scene): Stage {
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x2a2622, 0.7);
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);
  const pmrem = new THREE.PMREMGenerator(gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  return {
    setLook(looks) {
      const { look } = looks.opts;
      const lit = look === 'realistic' || look === 'cutaway';
      scene.background = looks.background();
      scene.environment = lit ? env : null;
      scene.environmentIntensity = 0.6;
      gl.toneMapping = lit ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      gl.toneMappingExposure = 1;
      hemi.intensity = look === 'flat' ? 1.2 : 0.7;
      sun.intensity = look === 'flat' ? 1.8 : 2.4;
    },
    fitShadow(min, max) {
      const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 + 40;
      sun.target.position.copy(c);
      sun.position.copy(c).addScaledVector(SUN_DIR, 1500);
      const cam = sun.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.near = 10; cam.far = 3200;
      cam.updateProjectionMatrix();
    },
    dispose() {
      env.dispose();
      pmrem.dispose();
      scene.remove(hemi, sun, sun.target);
    },
  };
}
```

- [ ] **Step 7: Failing loop tests.** `engine/loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLoop, MAX_DT, type LoopEnv } from './loop';

function fakeEnv() {
  let cb: ((t: number) => void) | null = null;
  let hidden = false;
  const env: LoopEnv = { raf: (f) => { cb = f; return 1; }, caf: () => { cb = null; }, hidden: () => hidden };
  return {
    env,
    frame(t: number) { const f = cb; cb = null; f?.(t); },
    pending: () => cb !== null,
    hide(v: boolean) { hidden = v; },
  };
}

describe('createLoop', () => {
  it('first frame has dt 0, later dt in seconds clamped to MAX_DT, sim scaled', () => {
    const f = fakeEnv();
    const seen: [number, number][] = [];
    const loop = createLoop(() => 2, f.env);
    loop.add({ update: (sim, real) => { seen.push([sim, real]); return true; } });
    f.frame(1000); f.frame(1016); f.frame(5000);
    expect(seen[0]).toEqual([0, 0]);
    expect(seen[1][1]).toBeCloseTo(0.016, 6);
    expect(seen[1][0]).toBeCloseTo(0.032, 6);
    expect(seen[2][1]).toBe(MAX_DT);
  });
  it('sleeps when nothing is active or the tab is hidden; wake restarts with dt 0', () => {
    const f = fakeEnv();
    let active = true;
    const dts: number[] = [];
    const loop = createLoop(() => 1, f.env);
    loop.add({ update: (_s, real) => { dts.push(real); return active; } });
    f.frame(0); f.frame(16);
    active = false;
    f.frame(32);
    expect(f.pending()).toBe(false);
    active = true;
    loop.wake();
    f.frame(9000);
    expect(dts[dts.length - 1]).toBe(0);
    f.hide(true);
    f.frame(9016);
    expect(f.pending()).toBe(false);
  });
  it('dispose cancels', () => {
    const f = fakeEnv();
    const loop = createLoop(() => 1, f.env);
    loop.add({ update: () => true });
    loop.dispose();
    expect(f.pending()).toBe(false);
  });
});
```

- [ ] **Step 8: Implement `engine/loop.ts`**

```ts
/** A per-frame participant. Return true to keep the loop awake. */
export interface Subsystem {
  update(simDt: number, realDt: number, now: number): boolean | void;
}

export interface Loop {
  add(s: Subsystem): () => void;
  /** Restart after the loop slept (keypress, visibility change, settings change). */
  wake(): void;
  dispose(): void;
}

export interface LoopEnv {
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  hidden(): boolean;
}

export const MAX_DT = 0.1;

const browserEnv = (): LoopEnv => ({
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  hidden: () => document.hidden,
});

/** The single animation loop (Global Constraint). simDt = realDt × speedMul(now); realDt ≤ MAX_DT. */
export function createLoop(speedMul: (now: number) => number, env: LoopEnv = browserEnv()): Loop {
  const subs: Subsystem[] = [];
  let id: number | null = null;
  let last = -1;
  let disposed = false;
  const schedule = () => {
    if (id === null && !disposed) id = env.raf(frame);
  };
  function frame(now: number): void {
    id = null;
    const dt = last < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    const simDt = dt * speedMul(now);
    let active = false;
    for (const s of [...subs]) if (s.update(simDt, dt, now)) active = true;
    if (active && !env.hidden()) schedule();
    else last = -1;
  }
  return {
    add(s) {
      subs.push(s);
      schedule();
      return () => {
        const i = subs.indexOf(s);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    wake: schedule,
    dispose() {
      disposed = true;
      if (id !== null) env.caf(id);
      id = null;
    },
  };
}
```

- [ ] **Step 9: Failing particles-view test.** `engine/particlesView.test.ts`:

```ts
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
```

- [ ] **Step 10: Implement `engine/particlesView.ts`**

```ts
import * as THREE from 'three';
import { MAX_PARTICLES, specOf, type ColorKey, type ParticleSystem } from './particles';

/** Particles live on their own layer so the line-art normal pass can skip them. */
export const PARTICLE_LAYER = 1;

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
uniform bool uOrtho;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uOrtho ? aSize * uScale : aSize * uScale / max(1.0, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.15, r));
}`;

interface Set_ { points: THREE.Points; pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array }

/** Draws a ParticleSystem as two pooled THREE.Points (normal + additive). */
export class ParticlesView {
  readonly group = new THREE.Group();
  private sets: [Set_, Set_];
  private uniforms = { uScale: { value: 400 }, uOrtho: { value: false } };
  private cache = new Map<ColorKey, THREE.Color>();

  constructor(private sys: ParticleSystem, private color: (k: ColorKey) => THREE.Color) {
    this.sets = [this.make(false), this.make(true)];
  }

  /** Copy live particles into the GPU buffers; returns the drawn counts. */
  sync(): { normal: number; additive: number } {
    const n = [0, 0];
    const s = this.sys;
    for (let i = 0; i < s.count; i++) {
      const spec = specOf(s.kind[i]);
      const k = spec.additive ? 1 : 0;
      const set = this.sets[k];
      const j = n[k]++;
      set.pos.set([s.p[i * 3], s.p[i * 3 + 1], s.p[i * 3 + 2]], j * 3);
      const key = Array.isArray(spec.color) ? spec.color[s.col[i]] : spec.color;
      const c = this.colorOf(key);
      set.col.set([c.r, c.g, c.b], j * 3);
      const t = s.age[i] / s.life[i];
      set.size[j] = s.size[i] * 2 * (1 + ((spec.grow ?? 1) - 1) * t);
      set.alpha[j] = 1 - t;
    }
    this.sets.forEach((set, k) => {
      const g = set.points.geometry;
      g.setDrawRange(0, n[k]);
      for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) g.getAttribute(a).needsUpdate = true;
    });
    return { normal: n[0], additive: n[1] };
  }

  /** px per world unit at distance 1 (perspective) or per unit (ortho); from CameraRig.pointScale(). */
  setProjection(scale: number, ortho: boolean): void {
    this.uniforms.uScale.value = scale;
    this.uniforms.uOrtho.value = ortho;
  }

  /** Look changed: colours come from the new look. */
  refresh(): void {
    this.cache.clear();
  }

  dispose(): void {
    for (const set of this.sets) {
      set.points.geometry.dispose();
      (set.points.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }

  private colorOf(k: ColorKey): THREE.Color {
    let c = this.cache.get(k);
    if (!c) this.cache.set(k, (c = this.color(k)));
    return c;
  }

  private make(additive: boolean): Set_ {
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const size = new Float32Array(MAX_PARTICLES);
    const alpha = new Float32Array(MAX_PARTICLES);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(g, m);
    points.frustumCulled = false;
    points.layers.set(PARTICLE_LAYER);
    this.group.add(points);
    return { points, pos, col, size, alpha };
  }
}
```

- [ ] **Step 11: Temporary Scene and bench.**

`components/Scene.tsx` mounts the renderer, stage and looks with a concrete floor slab only. Task 9 replaces it.

```tsx
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
      looks.dispose();
      stage.dispose();
      r.dispose();
    };
  }, []);
  return <div ref={rootRef} className="stage" />;
}
```

`app/dev/bench/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import BenchClient from './BenchClient';

export default function BenchPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <BenchClient />;
}
```

`app/dev/bench/BenchClient.tsx`:

```tsx
'use client';

import dynamic from 'next/dynamic';

const Bench = dynamic(() => import('@/components/Bench'), { ssr: false });

export default function BenchClient() {
  return <Bench />;
}
```

`components/Bench.tsx` is the dev bench and grows in later tasks. For now it renders, in a row along +x 40 units apart, one `RoundedBoxGeometry(24, 24, 24, 3, 3)` per `MATERIAL_ROLES` entry (via `looks.part`), plus a particle emitter that sprays `spark` and `sand` every frame at the row's end. It reuses `createRenderer`, `createStage`, `Looks`, `ParticleSystem`, `ParticlesView` and `createLoop`. The camera is a fixed `PerspectiveCamera` as in `Scene.tsx`. The loop calls `particles.update`, `view.sync()`, `view.setProjection(r.size().h * r.gl.getPixelRatio() / (2 * Math.tan((32 * Math.PI) / 360)), false)` and `gl.render`. Overlaid HTML buttons (class `bench-bar`, styled in `globals.css` as a fixed top-left flex row of small buttons) do the following:
- Look buttons: `looks.set({...}); looks.apply(scene); stage.setLook(looks); view.refresh()`.
- Theme toggle and quality toggle.
- An HTML caption under the bar listing the roles in order (the HTML overlay is allowed on the bench; letters in the 3D world are not).

- [ ] **Step 12: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`; all green. Run `pnpm dev`, open `/dev/bench`, and check that all four looks render 14 swatches and particles. Then:

```bash
git add -A && git commit -m "feat(engine): three.js renderer, looks, loop, particles view; drop hairline"
```

---

### Task 7: Post-processing and camera rig

**Files:**
- Create: `engine/edgePass.ts`, `engine/post.ts`, `engine/camera.ts`
- Test: `engine/camera.test.ts`
- Modify: `components/Bench.tsx` (switch to rig, orbit, post)

**Interfaces:**
- Consumes: `Looks`, `PARTICLE_LAYER`, `Look`, `Quality`, `Vec3`.
- Produces:
  - `createPost(gl, scene): Post`, with `render(cam)`, `setSize(w, h, pr)`, `configure(look, quality, edge)`, `dispose()`
  - `class CameraRig`, with members:
    - `mode`, `persp`, `ortho`, `active()`, `isOrtho()`
    - `setLook(look)`, `resize(w, h, pr)`, `attach(dom)`, `snap()`
    - `update(realDt, now)`, `center()`, `pointScale()`, `dispose()`
  - `viewDir(look)`, `fitView(min, max, dir, aspect, ortho, pad?)`, `FOV`, `CameraTargets`, `CameraMode`

- [ ] **Step 1: Failing camera tests.** `engine/camera.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, FOV, fitView, viewDir } from './camera';
import { LOOKS, type Vec3 } from './types';

const corners = (min: Vec3, max: Vec3) => {
  const out: THREE.Vector3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push(new THREE.Vector3(x, y, z));
  return out;
};

describe('viewDir', () => {
  it('is a unit vector from the -y side, and +x reads left→right', () => {
    for (const look of LOOKS) {
      const d = new THREE.Vector3(...viewDir(look));
      expect(d.length()).toBeCloseTo(1, 9);
      expect(d.y).toBeLessThan(0);
      const right = d.clone().negate().cross(new THREE.Vector3(0, 0, 1));
      expect(right.x).toBeGreaterThan(0);
    }
  });
  it('flat is true isometric', () => {
    const d = viewDir('flat');
    expect(Math.asin(d[2]) * (180 / Math.PI)).toBeCloseTo(35.264, 2);
  });
});

describe('fitView', () => {
  const min: Vec3 = [0, -300, 0];
  const max: Vec3 = [900, 0, 120];
  for (const ortho of [false, true]) {
    it(`keeps every corner on screen (${ortho ? 'ortho' : 'persp'})`, () => {
      const aspect = 16 / 9;
      const dir = new THREE.Vector3(...viewDir('realistic'));
      const { target, extent } = fitView(min, max, viewDir('realistic'), aspect, ortho);
      const t = new THREE.Vector3(...target);
      const cam = ortho
        ? new THREE.OrthographicCamera(-extent * aspect, extent * aspect, extent, -extent, -10000, 10000)
        : new THREE.PerspectiveCamera(FOV, aspect, 1, 20000);
      cam.up.set(0, 0, 1);
      cam.position.copy(t).addScaledVector(dir, ortho ? 3000 : extent);
      cam.lookAt(t);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const c of corners(min, max)) {
        const p = c.clone().project(cam);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1.0001);
      }
    });
  }
});

describe('CameraRig', () => {
  it('follow mode converges on the newest job', () => {
    let newest: Vec3 = [500, -100, 22];
    const rig = new CameraRig({ overview: () => ({ min: [0, -300, 0], max: [900, 0, 120] }), newest: () => newest, busiest: () => null, followSpan: () => 400 });
    rig.resize(1280, 720, 1);
    rig.snap();
    rig.mode = 'follow';
    for (let i = 0; i < 300; i++) rig.update(1 / 60, i * 16);
    expect(rig.center().x).toBeCloseTo(500, 0);
    newest = [100, -100, 22];
    for (let i = 0; i < 300; i++) rig.update(1 / 60, 5000 + i * 16);
    expect(rig.center().x).toBeCloseTo(100, 0);
  });
  it('switches projection with the look', () => {
    const rig = new CameraRig({ overview: () => ({ min: [0, 0, 0], max: [100, 100, 100] }), newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.setLook('flat');
    expect(rig.isOrtho()).toBe(true);
    rig.setLook('realistic');
    expect(rig.isOrtho()).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `engine/camera.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTICLE_LAYER } from './particlesView';
import type { Look, Vec3 } from './types';

export type CameraMode = 'overview' | 'follow' | 'cinematic';

/** What the camera looks at; supplied by the Scene. */
export interface CameraTargets {
  overview(): { min: Vec3; max: Vec3 };
  newest(): Vec3 | null;
  busiest(): Vec3 | null;
  followSpan(): number;
}

export const FOV = 32;
const TAN = Math.tan((FOV * Math.PI) / 360);
const CINEMATIC_MS = 4000;
const CINEMATIC_ZOOM = 2.2;
const USER_HOLD_MS = 4000;
const Z = new THREE.Vector3(0, 0, 1);

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Unit vector from the target toward the camera. The viewer stands at −y so +x reads left→right. */
export function viewDir(look: Look): Vec3 {
  switch (look) {
    case 'flat': return norm([1, -1, 1]); // true isometric: elevation asin(1/√3) = 35.264°
    case 'cutaway': return norm([0, -1, 0.12]);
    default: return norm([0.55, -1, 0.85]);
  }
}

export const isOrthoLook = (look: Look) => look === 'flat' || look === 'cutaway';

/** Target and extent (perspective: distance; ortho: half-height) that frame a world box. */
export function fitView(min: Vec3, max: Vec3, dir: Vec3, aspect: number, ortho: boolean, pad = 1.08): { target: Vec3; extent: number } {
  const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const back = new THREE.Vector3(...dir);
  const f = back.clone().negate();
  const right = f.clone().cross(Z).normalize();
  const up = right.clone().cross(f).normalize();
  let need = 0;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const v = new THREE.Vector3(x, y, z).sub(c);
    const px = Math.abs(v.dot(right));
    const py = Math.abs(v.dot(up));
    const toward = v.dot(back);
    need = ortho ? Math.max(need, py, px / aspect) : Math.max(need, toward + py / TAN, toward + px / (TAN * aspect));
  }
  return { target: [c.x, c.y, c.z], extent: need * pad };
}

/** One camera rig: perspective (realistic/lineart) or orthographic (flat/cutaway); damps toward its mode's goal. */
export class CameraRig {
  mode: CameraMode = 'overview';
  readonly persp = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
  private look: Look = 'realistic';
  private aspect = 1;
  private hPx = 1;
  private target = new THREE.Vector3();
  private dir = new THREE.Vector3(...viewDir('realistic'));
  private extent = 800;
  private controls: OrbitControls | null = null;
  private dragging = false;
  private userUntil = -Infinity;
  private cineAt = -Infinity;
  private cineTarget: Vec3 | null = null;

  constructor(private targets: CameraTargets) {
    for (const c of [this.persp, this.ortho]) {
      c.up.set(0, 0, 1);
      c.layers.enable(PARTICLE_LAYER);
    }
  }

  active(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.isOrtho() ? this.ortho : this.persp;
  }

  isOrtho(): boolean { return isOrthoLook(this.look); }

  setLook(look: Look): void {
    const wasOrtho = this.isOrtho();
    this.look = look;
    if (wasOrtho !== this.isOrtho()) this.extent = this.isOrtho() ? this.extent * TAN : this.extent / TAN;
    if (this.controls) this.controls.object = this.active();
    this.apply();
  }

  resize(w: number, h: number, pixelRatio: number): void {
    this.aspect = Math.max(1e-3, w / Math.max(1, h));
    this.hPx = h * pixelRatio;
    this.apply();
  }

  /** Orbit/zoom by pointer; the rig yields for USER_HOLD_MS after the last interaction. */
  attach(dom: HTMLElement): void {
    const c = new OrbitControls(this.active(), dom);
    c.enableDamping = false;
    c.addEventListener('start', () => { this.dragging = true; });
    c.addEventListener('end', () => { this.dragging = false; this.userUntil = performance.now() + USER_HOLD_MS; });
    this.controls = c;
  }

  /** Jump to the current goal (first frame, factory switch). */
  snap(): void {
    const g = this.goal(performance.now());
    this.target.set(...g.target);
    this.dir.set(...g.dir);
    this.extent = g.extent;
    this.apply();
  }

  /** Returns true (the camera always participates in the frame). */
  update(realDt: number, now: number): boolean {
    if (this.controls && (this.dragging || now < this.userUntil)) {
      this.controls.target.copy(this.target);
      this.controls.update();
      this.readBack();
      return true;
    }
    const g = this.goal(now);
    const a = 1 - Math.exp(-realDt * 3);
    this.target.lerp(new THREE.Vector3(...g.target), a);
    this.dir.lerp(new THREE.Vector3(...g.dir), a).normalize();
    this.extent += (g.extent - this.extent) * a;
    this.apply();
    return true;
  }

  /** Audio listener: world x at screen centre and half the visible width. */
  center(): { x: number; halfWidth: number } {
    const halfH = this.isOrtho() ? this.extent : this.extent * TAN;
    return { x: this.target.x, halfWidth: halfH * this.aspect };
  }

  /** Point-size scale for ParticlesView.setProjection. */
  pointScale(): number {
    return this.isOrtho() ? this.hPx / (2 * this.extent) : this.hPx / (2 * TAN);
  }

  dispose(): void {
    this.controls?.dispose();
  }

  private goal(now: number): { target: Vec3; dir: Vec3; extent: number } {
    const ortho = this.isOrtho();
    const base = viewDir(this.look);
    const ov = this.targets.overview();
    const fit = fitView(ov.min, ov.max, base, this.aspect, ortho);
    if (this.mode === 'follow') {
      const p = this.targets.newest();
      if (!p) return { ...fit, dir: base };
      const s = this.targets.followSpan() / 2;
      const f = fitView([p[0] - s, p[1] - s / 2, p[2]], [p[0] + s, p[1] + s / 2, p[2] + s / 1.5], base, this.aspect, ortho);
      return { target: f.target, dir: base, extent: f.extent };
    }
    if (this.mode === 'cinematic') {
      if (now - this.cineAt > CINEMATIC_MS) {
        this.cineAt = now;
        this.cineTarget = this.targets.busiest() ?? this.targets.newest();
      }
      const yaw = 0.18 * Math.sin(now / 6000);
      const d = new THREE.Vector3(...base).applyAxisAngle(Z, yaw);
      return { target: this.cineTarget ?? fit.target, dir: [d.x, d.y, d.z], extent: fit.extent / CINEMATIC_ZOOM };
    }
    return { ...fit, dir: base };
  }

  private readBack(): void {
    const cam = this.active();
    this.target.copy(this.controls!.target);
    this.dir.copy(cam.position).sub(this.target).normalize();
    if (this.isOrtho()) {
      this.extent = this.extent / this.ortho.zoom;
      this.ortho.zoom = 1;
    } else {
      this.extent = cam.position.distanceTo(this.target);
    }
    this.apply();
  }

  private apply(): void {
    if (this.isOrtho()) {
      const h = this.extent;
      Object.assign(this.ortho, { left: -h * this.aspect, right: h * this.aspect, top: h, bottom: -h });
      this.ortho.position.copy(this.target).addScaledVector(this.dir, 5000);
      this.ortho.lookAt(this.target);
      this.ortho.updateProjectionMatrix();
    } else {
      this.persp.aspect = this.aspect;
      this.persp.position.copy(this.target).addScaledVector(this.dir, this.extent);
      this.persp.lookAt(this.target);
      this.persp.updateProjectionMatrix();
    }
  }
}
```

- [ ] **Step 3: Edge pass.** `engine/edgePass.ts`:

```ts
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform vec3 edgeColor;
uniform float cameraNear;
uniform float cameraFar;
uniform bool ortho;
varying vec2 vUv;
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return ortho ? orthographicDepthToViewZ(d, cameraNear, cameraFar) : perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}
void main() {
  vec2 px = 1.0 / resolution;
  float zc = viewZ(vUv);
  vec3 nc = texture2D(tNormal, vUv).xyz;
  float dz = 0.0;
  float dn = 0.0;
  vec2 offs[4];
  offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
  for (int i = 0; i < 4; i++) {
    dz += abs(viewZ(vUv + offs[i]) - zc);
    dn += distance(texture2D(tNormal, vUv + offs[i]).xyz, nc);
  }
  float depthEdge = smoothstep(0.015, 0.04, dz / max(-zc, 1.0));
  float normalEdge = smoothstep(0.35, 0.7, dn);
  float e = max(depthEdge, normalEdge);
  vec4 c = texture2D(tDiffuse, vUv);
  gl_FragColor = vec4(mix(c.rgb, edgeColor, e), c.a);
}`;
const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Line-art look: Sobel on depth + view normals of layer 0 (particles excluded), drawn over the colour. */
export class EdgePass extends Pass {
  readonly edgeColor = new THREE.Color();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private normalMat = new THREE.MeshNormalMaterial();
  private mat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor(private scene: THREE.Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
    super();
    this.camera = camera;
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) }, edgeColor: { value: new THREE.Color() },
        cameraNear: { value: 1 }, cameraFar: { value: 1000 }, ortho: { value: false },
      },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(w, h);
    (this.mat.uniforms.resolution.value as THREE.Vector2).set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const cam = this.camera;
    const mask = cam.layers.mask;
    const bg = this.scene.background;
    cam.layers.set(0);
    this.scene.background = null;
    this.scene.overrideMaterial = this.normalMat;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, cam);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    cam.layers.mask = mask;
    const u = this.mat.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tNormal.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    u.ortho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;
    (u.edgeColor.value as THREE.Color).copy(this.edgeColor);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.normalMat.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
```

- [ ] **Step 4: Post chains.** `engine/post.ts`:

```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EdgePass } from './edgePass';
import type { Look, Quality } from './types';

type Cam = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface Post {
  render(camera: Cam): void;
  setSize(w: number, h: number, pixelRatio: number): void;
  /** realistic/cutaway: render→bloom(high)→output; lineart: render→edge→bloom(high)→output; flat: render→output. */
  configure(look: Look, quality: Quality, edge: THREE.Color): void;
  dispose(): void;
}

export function createPost(gl: THREE.WebGLRenderer, scene: THREE.Scene): Post {
  const composer = new EffectComposer(gl);
  const initial = new THREE.PerspectiveCamera();
  const renderPass = new RenderPass(scene, initial);
  const edge = new EdgePass(scene, initial);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.9);
  const output = new OutputPass();
  return {
    render(camera) {
      renderPass.camera = camera;
      edge.camera = camera;
      composer.render();
    },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
    configure(look, quality, edgeColor) {
      while (composer.passes.length) composer.removePass(composer.passes[0]);
      composer.addPass(renderPass);
      if (look === 'lineart') {
        edge.edgeColor.copy(edgeColor);
        composer.addPass(edge);
      }
      if (quality === 'high' && look !== 'flat') composer.addPass(bloom);
      composer.addPass(output);
    },
    dispose() {
      edge.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
```

- [ ] **Step 5: Bench switches to rig + post.**
- `components/Bench.tsx`: replace the fixed camera with a `CameraRig`. Its `overview` is the swatch row's box; `newest` and `busiest` return `null`; `followSpan` is 400.
- Call `rig.attach(canvas)`, `rig.snap()` and `post.configure(...)`. On every look change also call `rig.setLook(look)`.
- For cutaway, add a clipping plane `new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)` via `gl.clippingPlanes = [plane]`; otherwise `gl.clippingPlanes = []`.
- Each frame: `rig.update(realDt, now)` → `view.setProjection(rig.pointScale(), rig.isOrtho())` → `post.render(rig.active())`.
- Add mode buttons (overview / cinematic).

- [ ] **Step 6: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`, all green. Then open `/dev/bench` and check:
- Line-art shows crisp outlines on the swatches.
- Realistic shows bloom on molten and glow.
- Cutaway halves the swatches at y = 0 with dark interiors.
- Dragging orbits, and the camera eases back about 4 s after release.

```bash
git add -A && git commit -m "feat(engine): camera rig with four looks, line-art edge pass, bloom"
```

---

### Task 8: Parts kit, conveyor, robot arm

**Files:**
- Create: `factories/shared/dims.ts`, `factories/shared/parts.ts`, `factories/shared/conveyor.ts`, `factories/shared/robotArm.ts`
- Test: `factories/shared/parts.test.ts`, `factories/shared/robotArm.test.ts`
- Modify: `components/Bench.tsx` (parts showcase)

**Interfaces:**
- Consumes: `Looks`, `MaterialRole`, `solveArm`/`ArmDims`/`ArmPose`, `BELT_STRIPE`.
- Produces:
  - Dimensions: `BELT_TOP = 22`, `BELT_W = 52`
  - Parts: `housing`, `box`, `column`, `beam`, `pipe`, `lathe`, `flange`, `piston`, `gear`, `gauge`, `lamp`, `panel`, `hazardBand`, `railing`, `legs`
  - Conveyor: `buildConveyor(looks, path, opts?) → Conveyor`
  - Arm: `ARM`, `WRIST`, `class RobotArm`

- [ ] **Step 1: `factories/shared/dims.ts`**

```ts
/** World z of the conveyor surface. Station local z = 0 is this height; the floor is local z = -BELT_TOP. */
export const BELT_TOP = 22;
/** Belt width (the letter flask is 46 wide). Station footprints must be at least this wide. */
export const BELT_W = 52;
```

- [ ] **Step 2: Failing parts tests.** `factories/shared/parts.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { beam, column, gauge, housing, lamp, lathe, piston, pipe } from './parts';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const bbox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('parts', () => {
  it('housing / column / lathe stand on z=0, centred on x/y', () => {
    for (const o of [housing(looks, 40, 30, 20), column(looks, 5, 50), lathe(looks, [[0, 0], [10, 0], [10, 30], [0, 30]], 'paint')]) {
      const b = bbox(o);
      expect(b.min.z).toBeCloseTo(0, 5);
      expect(b.min.x + b.max.x).toBeCloseTo(0, 5);
      expect(b.min.y + b.max.y).toBeCloseTo(0, 5);
    }
    expect(bbox(column(looks, 5, 50)).max.z).toBeCloseTo(50, 5);
    expect(bbox(lathe(looks, [[0, 0], [10, 0], [10, 30], [0, 30]], 'paint')).max.z).toBeCloseTo(30, 5);
  });
  it('beam spans its endpoints', () => {
    const b = bbox(beam(looks, [0, 0, 0], [100, 0, 50], 4));
    expect(b.min.x).toBeLessThanOrEqual(0.01 + 4);
    expect(b.max.x).toBeGreaterThanOrEqual(100 - 4);
    expect(b.max.z).toBeGreaterThanOrEqual(50 - 4);
  });
  it('piston extends its rod downward', () => {
    const p = piston(looks, { body: 6, rod: 2, len: 30, stroke: 20 });
    p.set(0);
    const z0 = bbox(p.group).min.z;
    p.set(1);
    expect(bbox(p.group).min.z).toBeCloseTo(z0 - 20, 4);
  });
  it('lamp swaps role between glow and rubber', () => {
    const l = lamp(looks, 2);
    const mesh = l.group.children[0] as THREE.Mesh;
    l.set(true);
    expect(mesh.userData.role).toBe('glow');
    l.set(false);
    expect(mesh.userData.role).toBe('rubber');
  });
  it('gauge needle rotates with value', () => {
    const g = gauge(looks, 6);
    g.set(0);
    const a = g.group.getObjectByName('needle')!.rotation.y;
    g.set(1);
    expect(g.group.getObjectByName('needle')!.rotation.y).not.toBeCloseTo(a, 3);
  });
  it('pipe follows its points', () => {
    const b = bbox(pipe(looks, [[0, 0, 0], [0, 0, 40], [30, 0, 40]], 2));
    expect(b.max.z).toBeGreaterThanOrEqual(39);
    expect(b.max.x).toBeGreaterThanOrEqual(29);
  });
});
```

- [ ] **Step 3: Implement `factories/shared/parts.ts`.** Every function returns objects built with `looks.part`, using local coordinates with z up and "bottom at z = 0, centred on x/y" unless stated otherwise. Write it exactly to these signatures:

```ts
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Looks, MaterialRole } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';

const up = (g: THREE.BufferGeometry, h: number) => g.rotateX(Math.PI / 2).translate(0, 0, h / 2);

/** Rounded box, bottom at z=0. */
export function housing(looks: Looks, w: number, d: number, h: number, role: MaterialRole = 'paint', r = 2): THREE.Mesh {
  return looks.part(new RoundedBoxGeometry(w, d, h, 3, Math.min(r, w / 2, d / 2, h / 2)).translate(0, 0, h / 2), role);
}

/** Sharp box, bottom at z=0. */
export function box(looks: Looks, w: number, d: number, h: number, role: MaterialRole): THREE.Mesh {
  return looks.part(new THREE.BoxGeometry(w, d, h).translate(0, 0, h / 2), role);
}

/** Vertical cylinder, bottom at z=0. */
export function column(looks: Looks, r: number, h: number, role: MaterialRole = 'steel', seg = 16): THREE.Mesh {
  return looks.part(up(new THREE.CylinderGeometry(r, r, h, seg), h), role);
}

/** Square-section beam between two points. */
export function beam(looks: Looks, from: Vec3, to: Vec3, size: number, role: MaterialRole = 'steel'): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(size, size, len);
  const m = looks.part(g, role);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
  return m;
}

/** Tube through points (gentle bends). */
export function pipe(looks: Looks, pts: Vec3[], r: number, role: MaterialRole = 'steel'): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
  return looks.part(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 12), r, 12, false), role);
}

/** Lathe around the z axis; profile = [radius, z] pairs. */
export function lathe(looks: Looks, profile: [number, number][], role: MaterialRole, seg = 32): THREE.Mesh {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
  return looks.part(g, role);
}
```

Then implement these to their doc comments:

```ts
/** Ring plate (radius r, 2 thick) with `bolts` instanced hex bolt heads on a circle of 0.8r; group bottom at z=0. */
export function flange(looks: Looks, r: number, bolts: number, role: MaterialRole = 'steel'): THREE.Group;
/** Hydraulic cylinder hanging from z=0: body (radius `body`, length `len`) above the mount line at z∈[0, len],
 *  rod (radius `rod`) below it; set(ext 0..1) slides the rod's lower end from z=0 down to z=-stroke. Rod visible length = stroke + 4. */
export function piston(looks: Looks, o: { body: number; rod: number; len: number; stroke: number; role?: MaterialRole }): { group: THREE.Group; rodEnd: THREE.Object3D; set(ext: number): void };
/** Spur gear: ExtrudeGeometry of a toothed outline (teeth × trapezoid teeth), axis z, bottom at z=0. */
export function gear(looks: Looks, r: number, teeth: number, thick: number, role: MaterialRole = 'steel'): THREE.Mesh;
/** Round dial facing −y: housing ring (steel), face (glow), needle (rubber, name 'needle', rotates about y; set(v 0..1) maps to -135°..135°). */
export function gauge(looks: Looks, r: number): { group: THREE.Group; set(v: number): void };
/** Small sphere lamp; set(on) swaps userData.role glow↔rubber and its material via looks.material(role). children[0] is the sphere. */
export function lamp(looks: Looks, r: number): { group: THREE.Group; set(on: boolean): void };
/** Control box (paint) w × 10 × h with 3 lamps blinking at different rates and 2 buttons (paint-accent, rubber); update(now ms). Front faces −y. */
export function panel(looks: Looks, w: number, h: number): { group: THREE.Group; update(now: number): void };
/** Diagonal hazard stripes: alternating paint-accent / rubber thin boxes covering w × d at height h (bottom z=0). */
export function hazardBand(looks: Looks, w: number, d: number, h: number): THREE.Group;
/** Guard railing: posts every ≤ 30 along the polyline, two rails at 0.55h and h, all steel 1.5 thick. */
export function railing(looks: Looks, pts: Vec3[], h: number): THREE.Group;
/** Four legs (steel, size×size) from z=-h up to z=0 at the corners of w × d (inset size), with feet plates. */
export function legs(looks: Looks, w: number, d: number, h: number, size = 4): THREE.Group;
```

`lamp.set` sets `mesh.userData.role` and `mesh.material = looks.material(role)`, which is why `Looks.apply` keeps the lamp's state correct after a look switch.

- [ ] **Step 4: Conveyor.** Implement `factories/shared/conveyor.ts` to this spec:

```ts
import * as THREE from 'three';
import { BELT_STRIPE, type Looks } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';
import { BELT_W } from './dims';
import { column, legs, lathe } from './parts';

export interface Conveyor { group: THREE.Group; update(simDt: number, speed: number): void; dispose(): void }

/**
 * Belt conveyor along a layout path (world coords; each point's z is the belt top).
 *  - Horizontal segment a→b: a sub-group at a, yawed to atan2(dy, dx), containing
 *      belt: BoxGeometry(L, BELT_W - 6, 3) top at z=0, role 'belt', uv u scaled by L / BELT_STRIPE
 *            (multiply every uv.x by L / BELT_STRIPE) so the shared stripe texture scrolls along +x;
 *      side rails: two steel boxes (L × 3 × 7) at y = ±(BELT_W/2), z from -6 to +1;
 *      end drums: column-shaped cylinders (r 3, length BELT_W - 6) along y at x=0 and x=L, z = -1.5,
 *            spun about their axis by simDt*speed/3 rad in update();
 *      legs: pairs every ≤ 60 units, steel 4×4, from floor (z = -a.z... i.e. local z = -pointZ) to z=-6.
 *  - Interior path vertices (snake U-turns) get a turntable: lathe disc r = BELT_W/2, 3 thick, role 'steel',
 *    top at z=0. Belts touching an interior vertex are shortened by BELT_W/2 at that end so they meet the disc.
 *  - Vertical segment (same x,y, different z): an elevator shaft housing BELT_W × BELT_W tall, role 'paint',
 *    from the lower z - 6 to the upper z.
 * `extendStart` / `extendEnd` (default 0) lengthen the first/last segment outward (so products at the
 * first/last station sit fully on a belt).
 */
export function buildConveyor(looks: Looks, path: Vec3[], opts: { extendStart?: number; extendEnd?: number } = {}): Conveyor;
```

`dispose()` disposes every geometry it created and removes the group. The shared belt texture scroll stays in `Looks.scrollBelts`.

- [ ] **Step 5: Failing arm test.** `factories/shared/robotArm.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { RobotArm } from './robotArm';
import type { Vec3 } from '../../engine/types';

describe('RobotArm', () => {
  it('gripper tip reaches reachable targets (hierarchy signs match the IK)', () => {
    const arm = new RobotArm(new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }));
    const targets: Vec3[] = [[120, 0, 40], [0, -100, 30], [-80, 60, 120], [60, 60, 10]];
    for (const t of targets) {
      for (let i = 0; i < 200; i++) arm.reach(t, 1 / 30, 30);
      arm.group.updateMatrixWorld(true);
      const p = arm.tip.getWorldPosition(new THREE.Vector3());
      expect(p.distanceTo(new THREE.Vector3(...t)), `${t}`).toBeLessThan(0.5);
    }
  });
  it('reports unreachable targets', () => {
    const arm = new RobotArm(new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }));
    expect(arm.reach([900, 0, 0], 1 / 30)).toBe(false);
  });
});
```

- [ ] **Step 6: Implement `factories/shared/robotArm.ts`**

```ts
import * as THREE from 'three';
import type { Looks } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';
import { solveArm, type ArmDims, type ArmPose } from './ik';
import { column, housing } from './parts';

export const ARM: ArmDims = { shoulderZ: 60, upper: 100, fore: 95 };
/** Wrist pivot → gripper tip, pointing straight down. */
export const WRIST = 26;

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Industrial 6-axis-looking arm (yaw, shoulder, elbow, wrist pitch kept so the gripper points down,
 * wrist roll cosmetic). Local frame: base on the floor at (0,0,0), z up.
 * Hierarchy: group → base → yawG(rot z) → shoulderG(z=shoulderZ, rot y = -shoulder) → upper link along +x
 *   → elbowG(x=upper, rot y = +elbow) → fore link along +x → wristG(x=fore, rot y = π/2 + shoulder - elbow)
 *   → gripper along +x (length WRIST) → tip (Object3D at x=WRIST).
 */
export class RobotArm {
  readonly group = new THREE.Group();
  readonly tip = new THREE.Object3D();
  private yawG = new THREE.Group();
  private shoulderG = new THREE.Group();
  private elbowG = new THREE.Group();
  private wristG = new THREE.Group();
  private fingers: THREE.Mesh[] = [];
  private p: ArmPose = { yaw: 0, shoulder: 0.9, elbow: 1.6, reach: true };

  constructor(looks: Looks, private d: ArmDims = ARM) {
    const base = housing(looks, 40, 40, 12, 'paint-accent', 3);
    const turret = column(looks, 12, d.shoulderZ - 12, 'paint-accent', 24);
    turret.position.z = 12;
    this.group.add(base, this.yawG);
    this.yawG.add(turret, this.shoulderG);
    this.shoulderG.position.z = d.shoulderZ;
    const upperLink = housing(looks, d.upper, 14, 14, 'paint-accent', 4);
    upperLink.position.set(d.upper / 2, 0, -7);
    const motor = column(looks, 9, 22, 'steel', 20);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(0, -11, 0);
    this.shoulderG.add(upperLink, motor, this.elbowG);
    this.elbowG.position.x = d.upper;
    const foreLink = housing(looks, d.fore, 11, 11, 'paint-accent', 3.5);
    foreLink.position.set(d.fore / 2, 0, -5.5);
    const elbowMotor = column(looks, 7, 18, 'steel', 20);
    elbowMotor.rotation.x = Math.PI / 2;
    elbowMotor.position.set(0, -9, 0);
    this.elbowG.add(foreLink, elbowMotor, this.wristG);
    this.wristG.position.x = d.fore;
    const wrist = housing(looks, WRIST - 8, 9, 9, 'steel', 2);
    wrist.position.set((WRIST - 8) / 2, 0, -4.5);
    this.wristG.add(wrist, this.tip);
    for (const s of [-1, 1]) {
      const f = housing(looks, 8, 2, 7, 'rubber', 0.5);
      f.position.set(WRIST - 4, s * 4, -3.5);
      this.fingers.push(f);
      this.wristG.add(f);
    }
    this.tip.position.x = WRIST;
    this.applyPose();
  }

  pose(): ArmPose { return this.p; }

  /** Damp joints toward the IK solution that puts the gripper tip at `tip` (arm-local). False if out of reach. */
  reach(tip: Vec3, dt: number, rate = 8): boolean {
    const goal = solveArm([tip[0], tip[1], tip[2] + WRIST], this.d);
    const a = 1 - Math.exp(-rate * dt);
    this.p = {
      yaw: this.p.yaw + wrapPi(goal.yaw - this.p.yaw) * a,
      shoulder: this.p.shoulder + (goal.shoulder - this.p.shoulder) * a,
      elbow: this.p.elbow + (goal.elbow - this.p.elbow) * a,
      reach: goal.reach,
    };
    this.applyPose();
    return goal.reach;
  }

  /** 0 = open, 1 = closed. */
  grip(closed: number): void {
    const s = 4 - 2.5 * Math.min(1, Math.max(0, closed));
    this.fingers[0].position.y = -s;
    this.fingers[1].position.y = s;
  }

  private applyPose(): void {
    this.yawG.rotation.z = this.p.yaw;
    this.shoulderG.rotation.y = -this.p.shoulder;
    this.elbowG.rotation.y = this.p.elbow;
    this.wristG.rotation.y = Math.PI / 2 + this.p.shoulder - this.p.elbow;
  }
}
```

If the tip test fails on sign, the elbow or wrist rotation sign is wrong. Fix the hierarchy, not the test.

- [ ] **Step 7: Bench showcase.** In `components/Bench.tsx`, add a second row at y = −160:
- One conveyor along `[[0,-160,22],[300,-160,22],[300,-280,22]]`; call `looks.scrollBelts(dt * 80)` each frame.
- A `RobotArm` at (450, −200, 0) whose tip follows a target circling at radius 90 and height 40 + 30·sin.
- A `piston` cycling, `gauge`, `panel`, `gear` (rotating), `flange`, `hazardBand`, `railing` and `legs` under a housing.

- [ ] **Step 8: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`, all green. Check that the bench shows the parts in all four looks and the belt stripes scroll toward +x.

```bash
git add -A && git commit -m "feat(factories): procedural parts kit, belt conveyor, IK robot arm"
```

---

### Task 9: 3D contracts, factory host, shelf, scene wiring, minimal HUD

**Files:**
- Rewrite: `engine/station.ts`, `engine/product.ts`, `engine/factory.ts` (bodies already placed in Task 6; verify they match Step 1), `engine/factoryHost.ts`, `shelf/view.ts`, `components/Scene.tsx`
- Create: `hud/Hud.tsx`; HUD styles in `app/globals.css`
- Test: `engine/factoryHost.test.ts`, `shelf/view.test.ts`

**Interfaces:**
- Consumes: everything above; `Director`, `LineHost`, `Shelf`.
- Produces:
  - `StationCtx`, `StationDef`, `StationInstance`
  - `ProductModel`, `ProductHandle`, `ProductCtx`
  - `FactoryDef`
  - `FactoryHost`, with members:
    - `root`, `layout`, `line`, `shelfView`
    - `update(simDt, realDt)`, `relayout(mode)`, `restyle()`
    - `bounds()`, `newest()`, `busiest()`, `followSpan()`, `destroy()`
  - `ShelfView`, with members:
    - `group`, `slotPos`, `span`, `adopt`, `bounds`
    - `update`, `restyle`, `setOrigin`, `destroy`

- [ ] **Step 1: Contracts** (exact code)

`engine/station.ts`:

```ts
import type * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Looks } from './looks';
import type { ParticleSystem } from './particles';
import type { ProductHandle } from './product';
import type { Settings } from './settings';
import type { Job, Vec3 } from './types';

export interface StationCtx {
  /** Station root, already positioned at `origin`. Build in local coords: z=0 = belt top, floor at z=-BELT_TOP. */
  group: THREE.Group;
  origin: Vec3;
  looks: Looks;
  particles: ParticleSystem;   // world coordinates
  audio: AudioBus;
  settings: () => Settings;
  now: () => number;           // ms
  /** Jobs of this factory currently flying to the shelf (robot station tracks them). */
  placing: () => Job[];
  product: (jobId: number) => ProductHandle | null;
  /** Front shelf plank: x range, centre-line y and top z (world). */
  shelfSpan: () => { x0: number; x1: number; y: number; z: number };
}

export interface StationDef {
  id: string;
  label: string;
  footprint: [number, number]; // world x, y (≥ BELT_W)
  height: number;              // world z extent above the belt (camera fit)
  duration: number;            // sim seconds per job at speedMul 1
  spaceDuration?: number;      // default 0.25
  outputStage?: string;        // product stage after this station passes a job
  create(ctx: StationCtx): StationInstance;
}

export interface StationInstance {
  begin(job: Job, product: ProductHandle | null): void;
  /** Every frame. job/product null = idle (ambient motion only). t = job progress 0..1. May offset product.root (it is positioned before this call). */
  update(dt: number, job: Job | null, t: number, product: ProductHandle | null): void;
  finish(job: Job): 'pass' | 'reject';
  /** Look changed: rebuild any own() materials. */
  restyle?(): void;
  destroy(): void;
}
```

`engine/product.ts`:

```ts
import type * as THREE from 'three';
import type { Looks } from './looks';
import type { LetterMarks } from './settings';
import type { Job, ProductKind, Vec3 } from './types';

export interface ProductCtx { looks: Looks; marks: LetterMarks }

export interface ProductHandle {
  /** Moved by the host to job.pos (stations may add offsets after that). Product local z=0 = resting surface. */
  readonly root: THREE.Object3D;
  /** Continuous: shape(S_k, 1) ≡ shape(S_{k+1}, 0). Idempotent and cheap. */
  shape(stage: string, t: number): void;
  /** Robot hand-off 0..1 (placing arc progress); 1 = final shelf pose. */
  place(t: number): void;
  /** Look changed: recreate own() materials and re-apply the last shape/place. */
  restyle(): void;
  dispose(): void;
}

export interface ProductModel {
  kind: ProductKind;
  stages: readonly string[];  // stages[0] = fresh job
  size: Vec3;                 // shelf slot box in the final (placed) pose
  lineSize: number;           // largest horizontal extent while on the line (conveyor spacing)
  create(job: Job, ctx: ProductCtx): ProductHandle;
}
```

`engine/factory.ts`:

```ts
import type { ProductModel } from './product';
import type { StationDef } from './station';
import type { ProductKind } from './types';

export interface FactoryDef {
  kind: ProductKind;
  label: string;           // HUD label, e.g. 'Cast metal letter'
  stations: StationDef[];  // process order; last places on the shelf
  product: ProductModel;
}
```

- [ ] **Step 2: Failing shelf-view tests.** `shelf/view.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Job } from '../engine/types';
import { Shelf } from './model';
import { ShelfView } from './view';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const handle = (): ProductHandle & { disposed: boolean; placedT: number } => {
  const h = { root: new THREE.Group(), disposed: false, placedT: -1, shape() {}, place(t: number) { h.placedT = t; }, restyle() {}, dispose() { h.disposed = true; } };
  return h;
};
const job = (slotId: number, isSpace = false): Job => ({ id: slotId, slotId, char: 'a', isSpace, special: 'none', product: 'letter', stage: 'polished', phase: 'shelved', stationIndex: 6, progress: 1, pos: [0, 0, 0], defect: false, retries: 0 });

describe('ShelfView', () => {
  it('slots run +x along the front plank; new rows push older rows up and back', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const a = shelf.reserve('char', 'a');
    const b = shelf.reserve('char', 'b');
    const pa = v.slotPos(a.slotId)!;
    const pb = v.slotPos(b.slotId)!;
    expect(pb[0]).toBeGreaterThan(pa[0]);
    expect(pa[1]).toBe(-400);
    shelf.newline();
    shelf.reserve('char', 'c');
    const pa2 = v.slotPos(a.slotId)!;
    expect(pa2[2]).toBeGreaterThan(pa[2]);
    expect(pa2[1]).toBeGreaterThan(pa[1]);
  });
  it('adopt places the product, damps it to its slot, disposes on removal; spaces are disposed', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const s = shelf.reserve('char', 'a');
    shelf.markFilled(s.slotId);
    const h = handle();
    v.adopt(s.slotId, job(s.slotId), h);
    expect(h.placedT).toBe(1);
    for (let i = 0; i < 200; i++) v.update(1 / 60);
    const want = v.slotPos(s.slotId)!;
    expect(h.root.position.distanceTo(new THREE.Vector3(...want))).toBeLessThan(0.05);
    shelf.remove(s.slotId);
    v.update(1 / 60);
    expect(h.disposed).toBe(true);
    const sp = shelf.reserve('space', '');
    const hs = handle();
    v.adopt(sp.slotId, job(sp.slotId, true), hs);
    expect(hs.disposed).toBe(true);
  });
  it('span covers the plank width at the front row', () => {
    const v = new ShelfView(new THREE.Group(), new Shelf(), [26, 8, 32], looks, [100, -400, 0]);
    const s = v.span();
    expect(s.x0).toBe(100);
    expect(s.x1).toBeCloseTo(100 + v.width, 6);
    expect(s.y).toBe(-400);
  });
});
```

(If the `Shelf` reserve/markFilled/remove signatures differ, use the real ones from `shelf/model.ts`; do not change the model.)

- [ ] **Step 3: Implement `shelf/view.ts`**

```ts
import * as THREE from 'three';
import type { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Job, Vec3 } from '../engine/types';
import { box, column, housing } from '../factories/shared/parts';
import type { Shelf } from './model';

const MARGIN = 12;   // plank overhang past the first/last slot
const GAP_X = 8;     // between neighbouring products
const PLANK = 4;
const BASE = 18;     // lowest plank top above the floor
const HEADROOM = 16;
const BACK = 14;     // each older (higher) row steps back (+y)

/**
 * 3D typewriter shelf. The newest row is the front, lowest plank; older rows rise and step back
 * (paper feed). Products sit on plank tops, reading +x. Shelved handles are owned here.
 */
export class ShelfView {
  readonly group = new THREE.Group();
  private planks = new THREE.Group();
  private placed = new Map<number, ProductHandle>();
  private drawnRows = -1;
  private readonly pitch: number;
  private readonly rowH: number;
  private readonly depth: number;

  constructor(parent: THREE.Object3D, private shelf: Shelf, private size: Vec3, private looks: Looks, private origin: Vec3) {
    parent.add(this.group);
    this.group.add(this.planks);
    this.pitch = size[0] + GAP_X;
    this.rowH = size[2] + HEADROOM + PLANK;
    this.depth = size[1] + 14;
  }

  get width(): number { return MARGIN * 2 + this.shelf.cols * this.pitch; }

  setOrigin(o: Vec3): void { this.origin = o; this.drawnRows = -1; }

  slotPos(slotId: number): Vec3 | null {
    if (!this.shelf.getSlot(slotId)) return null;
    const { row, col } = this.shelf.slotPos(slotId);
    return this.cellPos(row, col);
  }

  span(): { x0: number; x1: number; y: number; z: number } {
    const [ox, oy, oz] = this.origin;
    return { x0: ox, x1: ox + this.width, y: oy, z: oz + BASE };
  }

  adopt(slotId: number, job: Job, h: ProductHandle | null): void {
    if (!h) return;
    if (job.isSpace) { h.dispose(); return; }
    h.place(1);
    this.group.add(h.root);
    this.placed.get(slotId)?.dispose();
    this.placed.set(slotId, h);
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const n = Math.max(1, this.shelf.rows.length);
    const [ox, oy, oz] = this.origin;
    return {
      min: [ox, oy - this.depth / 2, oz],
      max: [ox + this.width, oy + (n - 1) * BACK + this.depth / 2, oz + BASE + (n - 1) * this.rowH + this.size[2]],
    };
  }

  update(dt: number): boolean {
    if (this.shelf.rows.length !== this.drawnRows) this.drawPlanks();
    const a = 1 - Math.exp(-dt * 8);
    let moving = false;
    for (const [id, h] of this.placed) {
      const slot = this.shelf.getSlot(id);
      if (!slot || slot.state !== 'filled') { h.dispose(); this.placed.delete(id); continue; }
      const t = this.slotPos(id)!;
      const p = h.root.position;
      p.lerp(new THREE.Vector3(...t), a);
      if (p.distanceToSquared(new THREE.Vector3(...t)) > 0.01) moving = true;
    }
    return moving;
  }

  restyle(): void { for (const h of this.placed.values()) h.restyle(); }

  destroy(): void {
    for (const h of this.placed.values()) h.dispose();
    this.placed.clear();
    this.clearPlanks();
    this.group.removeFromParent();
  }

  private level(row: number): number { return this.shelf.rows.length - 1 - row; }

  private cellPos(row: number, col: number): Vec3 {
    const L = this.level(row);
    const [ox, oy, oz] = this.origin;
    return [ox + MARGIN + (col + 0.5) * this.pitch, oy + L * BACK, oz + BASE + L * this.rowH];
  }

  private clearPlanks(): void {
    this.planks.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.planks.clear();
  }

  private drawPlanks(): void {
    this.clearPlanks();
    const n = Math.max(1, this.shelf.rows.length);
    const [ox, oy, oz] = this.origin;
    for (let L = 0; L < n; L++) {
      const y = oy + L * BACK;
      const top = oz + BASE + L * this.rowH;
      const plank = housing(this.looks, this.width, this.depth, PLANK, 'wood', 1);
      plank.position.set(ox + this.width / 2, y, top - PLANK);
      this.planks.add(plank);
      for (const x of [ox + 3, ox + this.width / 2, ox + this.width - 3]) {
        const post = column(this.looks, 2, top - PLANK - oz, 'steel', 10);
        post.position.set(x, y + this.depth / 2 - 3, oz);
        this.planks.add(post);
      }
    }
    const foot = box(this.looks, this.width, 6, 3, 'steel');
    foot.position.set(ox + this.width / 2, oy + this.depth / 2 - 3, oz);
    this.planks.add(foot);
    this.drawnRows = this.shelf.rows.length;
  }
}
```

- [ ] **Step 4: Failing host tests.** `engine/factoryHost.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../audio/bus';
import { Director } from './director';
import type { FactoryDef } from './factory';
import { FactoryHost } from './factoryHost';
import { Looks } from './looks';
import { ParticleSystem } from './particles';
import type { ProductHandle, ProductModel } from './product';
import { defaultSettings, type Settings } from './settings';
import type { StationDef, StationInstance } from './station';
import type { Job } from './types';

interface RecHandle extends ProductHandle { shapes: [string, number][]; disposed: boolean; restyled: number }
interface RecInst extends StationInstance { seen: (Job | null)[]; got: (ProductHandle | null)[]; destroyed: boolean; restyled: number }

function setup() {
  const settings: Settings = { ...defaultSettings, product: 'letter', layout: 'pan' };
  const director = new Director({ settings: () => settings, now: () => 0 });
  const handles: RecHandle[] = [];
  const insts: RecInst[] = [];
  const product: ProductModel = {
    kind: 'letter', stages: ['raw', 'a', 'b'], size: [26, 8, 32], lineSize: 46,
    create: () => {
      const h: RecHandle = {
        root: new THREE.Group(), shapes: [], disposed: false, restyled: 0,
        shape(s, t) { h.shapes.push([s, t]); }, place() {}, restyle() { h.restyled++; }, dispose() { h.disposed = true; },
      };
      handles.push(h);
      return h;
    },
  };
  const station = (id: string, out: string): StationDef => ({
    id, label: id, footprint: [90, 90], height: 60, duration: 0.5, outputStage: out,
    create: () => {
      const i: RecInst = {
        seen: [], got: [], destroyed: false, restyled: 0,
        begin() {}, update(_dt, job, _t, p) { i.seen.push(job); i.got.push(p); }, finish: () => 'pass',
        restyle() { i.restyled++; }, destroy() { i.destroyed = true; },
      };
      insts.push(i);
      return i;
    },
  });
  const def: FactoryDef = { kind: 'letter', label: 'L', product, stations: [station('s1', 'a'), station('s2', 'b')] };
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const parent = new THREE.Group();
  const host = new FactoryHost(def, [0, 0, 0], { parent, looks, director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0 }, 'pan');
  const step = (n: number, dt = 1 / 30) => { for (let i = 0; i < n; i++) { director.update(dt); host.update(dt, dt); } };
  return { settings, director, host, handles, insts, step };
}

describe('FactoryHost', () => {
  it('creates a handle per job, positions it, hides queued jobs', () => {
    const f = setup();
    for (const c of 'abc') f.director.handle({ type: 'char', char: c });
    f.step(1);
    expect(f.handles).toHaveLength(3);
    const jobs = f.director.jobsOf('letter');
    const queued = jobs.filter((j) => j.phase === 'queued');
    expect(queued.length).toBeGreaterThan(0);
    for (const j of jobs) {
      const h = f.handles[j.id - 1];
      expect(h.root.visible).toBe(j.phase !== 'queued');
      expect(h.root.position.toArray()).toEqual(j.pos);
    }
  });
  it('stations receive their job + handle; off-station jobs are shaped once per stage', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(60);
    expect(f.insts[0].seen.some((j) => j !== null)).toBe(true);
    expect(f.insts[0].got.some((p) => p === f.handles[0])).toBe(true);
    const shapes = f.handles[0].shapes.filter(([, t]) => t === 1).map(([s]) => s);
    expect(new Set(shapes).size).toBe(shapes.length);
  });
  it('backspace mid-station disposes the handle and the station idles', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(3);
    f.director.handle({ type: 'backspace' });
    f.step(2);
    expect(f.handles[0].disposed).toBe(true);
    expect(f.insts[0].seen[f.insts[0].seen.length - 1]).toBeNull();
  });
  it('a finished product is adopted by the shelf (not disposed)', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(600);
    expect(f.director.shelf('letter').text()).toBe('a');
    expect(f.handles[0].disposed).toBe(false);
    expect(f.host.shelfView.group.children).toContain(f.handles[0].root);
  });
  it('relayout keeps handles and rebuilds stations; restyle reaches handles and stations', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(3);
    const before = f.insts.slice();
    f.host.relayout('snake');
    expect(before.every((i) => i.destroyed)).toBe(true);
    expect(f.handles[0].disposed).toBe(false);
    f.host.restyle();
    expect(f.handles[0].restyled).toBe(1);
    expect(f.insts[f.insts.length - 1].restyled).toBe(1);
  });
});
```

- [ ] **Step 5: Implement `engine/factoryHost.ts`**

```ts
import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import { buildConveyor, type Conveyor } from '../factories/shared/conveyor';
import { BELT_TOP } from '../factories/shared/dims';
import { hazardBand, housing } from '../factories/shared/parts';
import { ShelfView } from '../shelf/view';
import type { Director } from './director';
import type { FactoryDef } from './factory';
import { GAP, layoutStations, type LayoutResult } from './layout';
import { Line } from './line';
import type { Looks } from './looks';
import type { ParticleSystem } from './particles';
import type { ProductHandle } from './product';
import type { Settings } from './settings';
import type { StationInstance } from './station';
import type { Job, LayoutMode, Vec3 } from './types';

export interface HostDeps {
  parent: THREE.Object3D;
  looks: Looks;
  director: Director;
  particles: ParticleSystem;
  audio: AudioBus;
  settings: () => Settings;
  now: () => number;
}

const FLOOR_PAD = 70;

/**
 * Mounts one FactoryDef in 3D at its world origin: floor, conveyors, stations, the Line, product
 * handles for in-flight jobs (shelved ones belong to the ShelfView). Layout anchors sit at belt-top height.
 */
export class FactoryHost {
  readonly root = new THREE.Group();
  readonly line: Line;
  readonly shelfView: ShelfView;
  layout: LayoutResult;
  private world = new THREE.Group();
  private products = new THREE.Group();
  private instances: StationInstance[] = [];
  private conveyors: Conveyor[] = [];
  private handles = new Map<number, ProductHandle>();
  private shaped = new Map<number, string>();
  private offs: (() => void)[] = [];

  constructor(readonly def: FactoryDef, readonly origin: Vec3, private d: HostDeps, mode: LayoutMode) {
    d.parent.add(this.root);
    this.root.add(this.world, this.products);
    this.layout = this.computeLayout(mode);
    this.shelfView = new ShelfView(this.root, d.director.shelf(def.kind), def.product.size, d.looks, this.layout.shelfOrigin);
    this.line = new Line(def.stations, this.layout.anchors, this.layout.paths, (job, i) => this.decide(job, i), { minGap: def.product.lineSize + 8 });
    this.offs.push(
      d.director.attach(def.kind, { line: this.line, firstStage: def.product.stages[0], slotPos: (id) => this.shelfView.slotPos(id) }),
      d.director.events.on('job:created', ({ job }) => { if (job.product === def.kind) this.handleOf(job); }),
      this.line.onPhase((job) => {
        if (job.phase === 'station') this.instances[job.stationIndex]?.begin(job, this.handleOf(job));
      }),
      d.director.events.on('slot:filled', ({ kind, slotId, job }) => {
        if (kind !== def.kind) return;
        const h = this.handles.get(job.id) ?? null;
        this.handles.delete(job.id);
        this.shaped.delete(job.id);
        this.shelfView.adopt(slotId, job, h);
      }),
    );
    this.build();
  }

  relayout(mode: LayoutMode): void {
    this.teardown();
    this.layout = this.computeLayout(mode);
    this.line.relayout(this.layout.anchors, this.layout.paths);
    this.shelfView.setOrigin(this.layout.shelfOrigin);
    this.build();
  }

  restyle(): void {
    for (const h of this.handles.values()) h.restyle();
    for (const i of this.instances) i.restyle?.();
    this.shelfView.restyle();
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const a = this.layout.bounds;
    const b = this.shelfView.bounds();
    return {
      min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), 0],
      max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
    };
  }

  newest(): Vec3 | null {
    const jobs = this.d.director.jobsOf(this.def.kind).filter((j) => j.phase !== 'queued');
    return jobs.length ? jobs[jobs.length - 1].pos : null;
  }

  busiest(): Vec3 | null {
    const counts = new Array<number>(this.def.stations.length).fill(0);
    for (const j of this.line.jobs) {
      if (j.phase === 'station') counts[j.stationIndex]++;
      else if (j.phase === 'conveyor') counts[j.stationIndex + 1]++;
    }
    let best = -1;
    counts.forEach((c, i) => { if (c > 0 && (best < 0 || c >= counts[best])) best = i; });
    return best < 0 ? null : this.layout.anchors[best];
  }

  followSpan(): number {
    const fp = Math.max(...this.def.stations.map((s) => Math.max(...s.footprint)));
    return 2.5 * (fp + GAP);
  }

  update(simDt: number, realDt: number): boolean {
    for (const c of this.conveyors) c.update(simDt, 80);
    const at: (Job | null)[] = this.def.stations.map(() => null);
    const live = new Set<number>();
    for (const job of this.d.director.jobsOf(this.def.kind)) {
      live.add(job.id);
      const h = this.handleOf(job);
      h.root.visible = job.phase !== 'queued';
      h.root.position.set(job.pos[0], job.pos[1], job.pos[2]);
      if (job.phase === 'station') { at[job.stationIndex] = job; this.shaped.delete(job.id); continue; }
      if (job.phase === 'placing') { h.place(job.progress); continue; }
      if (this.shaped.get(job.id) !== job.stage) { h.shape(job.stage, 1); this.shaped.set(job.id, job.stage); }
    }
    this.instances.forEach((inst, i) => {
      const j = at[i];
      inst.update(simDt, j, j?.progress ?? 0, j ? this.handles.get(j.id) ?? null : null);
    });
    for (const [id, h] of this.handles) {
      if (!live.has(id)) { h.dispose(); this.handles.delete(id); this.shaped.delete(id); }
    }
    this.shelfView.update(realDt);
    return true;
  }

  destroy(): void {
    this.teardown();
    for (const off of this.offs) off();
    for (const h of this.handles.values()) h.dispose();
    this.handles.clear();
    this.shelfView.destroy();
    this.root.removeFromParent();
  }

  // ---- internals ----

  private computeLayout(mode: LayoutMode): LayoutResult {
    return layoutStations(this.def.stations, mode, [this.origin[0], this.origin[1], BELT_TOP]);
  }

  private handleOf(job: Job): ProductHandle {
    let h = this.handles.get(job.id);
    if (!h) {
      h = this.def.product.create(job, { looks: this.d.looks, marks: this.d.settings().letterMarks });
      h.root.visible = false;
      this.handles.set(job.id, h);
      this.products.add(h.root);
    }
    return h;
  }

  private decide(job: Job, i: number): 'pass' | 'reject' {
    const verdict = this.instances[i]?.finish(job) ?? 'pass';
    const out = this.def.stations[i].outputStage;
    if (verdict === 'pass' && out) job.stage = out;
    return verdict;
  }

  private build(): void {
    const { looks } = this.d;
    const b = this.layout.bounds;
    const s = this.shelfView.bounds();
    const x0 = Math.min(b.min[0], s.min[0]) - FLOOR_PAD;
    const x1 = Math.max(b.max[0], s.max[0]) + FLOOR_PAD;
    const y0 = Math.min(b.min[1], s.min[1]) - FLOOR_PAD;
    const y1 = Math.max(b.max[1], s.max[1]) + FLOOR_PAD;
    const floor = housing(looks, x1 - x0, y1 - y0, 4, 'concrete', 2);
    floor.position.set((x0 + x1) / 2, (y0 + y1) / 2, -4);
    floor.castShadow = false;
    this.world.add(floor);
    const walk = hazardBand(looks, x1 - x0 - 40, 6, 0.4);
    walk.position.set((x0 + x1) / 2, b.min[1] - 24, 0);
    this.world.add(walk);
    const ext = this.def.product.lineSize / 2 + 6;
    this.layout.paths.forEach((p, i) => {
      const c = buildConveyor(looks, p, { extendStart: i === 0 ? ext : 0, extendEnd: i === this.layout.paths.length - 1 ? ext : 0 });
      this.conveyors.push(c);
      this.world.add(c.group);
    });
    const kind = this.def.kind;
    this.instances = this.def.stations.map((st, i) => {
      const group = new THREE.Group();
      const o = this.layout.anchors[i];
      group.position.set(o[0], o[1], o[2]);
      this.world.add(group);
      return st.create({
        group, origin: o, looks, particles: this.d.particles, audio: this.d.audio, settings: this.d.settings, now: this.d.now,
        placing: () => this.d.director.jobsOf(kind).filter((j) => j.phase === 'placing'),
        product: (id) => this.handles.get(id) ?? null,
        shelfSpan: () => this.shelfView.span(),
      });
    });
  }

  private teardown(): void {
    for (const i of this.instances) i.destroy();
    this.instances = [];
    for (const c of this.conveyors) c.dispose();
    this.conveyors = [];
    this.world.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.world.clear();
  }
}
```

The conveyor speed constant: import `CONVEYOR_SPEED` from `./line` instead of the literal `80`.

- [ ] **Step 6: HUD.** `hud/Hud.tsx`:

```tsx
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
    return <button type="button" className="hud-toggle" onClick={() => set({ hudOpen: true })} aria-label="Open settings">⚙</button>;
  }
  return (
    <aside className="hud" aria-label="Factory settings">
      <header>
        <span>Factory</span>
        <button type="button" onClick={() => set({ hudOpen: false })} aria-label="Close settings">×</button>
      </header>
      <label>Look
        <select value={s.look} onChange={(e) => set({ look: e.target.value as Look })}>
          {LOOKS.map((l) => <option key={l} value={l}>{LOOK_LABEL[l]}</option>)}
        </select>
      </label>
      <label>Pace
        <select value={s.pace} onChange={(e) => set({ pace: e.target.value as Pace })}>
          {PACES.map((p) => <option key={p} value={p}>{PACE_LABEL[p]}</option>)}
        </select>
      </label>
      <label>Camera
        <select value={s.camera} onChange={(e) => set({ camera: e.target.value as (typeof CAMERAS)[number] })} disabled={s.pace === 'cinematic'}>
          {CAMERAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Theme
        <select value={s.theme} onChange={(e) => set({ theme: e.target.value as 'light' | 'dark' })}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label>Quality
        <select value={s.quality} onChange={(e) => set({ quality: e.target.value as Quality })}>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="hud-row">
        <input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} />
        Sound
      </label>
      <label>Volume
        <input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={!s.sound} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </label>
    </aside>
  );
}
```

Append to `app/globals.css`:

```css
.hud-toggle, .hud { position: fixed; top: 12px; right: 12px; z-index: 10; color: #d9dce0; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.hud-toggle { width: 36px; height: 36px; border-radius: 8px; border: 1px solid #2a2e34; background: rgba(14, 16, 19, 0.86); cursor: pointer; }
.hud { width: 248px; padding: 12px; display: grid; gap: 10px; background: rgba(14, 16, 19, 0.88); border: 1px solid #2a2e34; border-radius: 10px; backdrop-filter: blur(6px); }
.hud header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.hud header button { background: none; border: 0; color: inherit; font-size: 16px; cursor: pointer; }
.hud label { display: grid; gap: 4px; }
.hud .hud-row { display: flex; gap: 8px; align-items: center; }
.hud select, .hud input[type='range'] { width: 100%; background: #16191d; color: inherit; border: 1px solid #2a2e34; border-radius: 6px; padding: 4px; }
.hud-toggle:focus-visible, .hud select:focus-visible, .hud button:focus-visible, .hud input:focus-visible { outline: 2px solid #e3a817; outline-offset: 2px; }
```

- [ ] **Step 7: Scene wiring.** Rewrite `components/Scene.tsx`:

```tsx
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
```

- [ ] **Step 8: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`, all green. `pnpm dev` shows the floor and an empty scene, because no factory is registered yet. Check that the HUD opens and closes with Escape and the gear button, and that switching look restyles the floor.

```bash
git add -A && git commit -m "feat(engine): 3d factory host, typewriter shelf, scene wiring, minimal hud"
```

---

### Task 10: Cast metal letter product

**Files:**
- Create: `factories/letter/visual.ts`, `factories/letter/product.ts`
- Test: `factories/letter/visual.test.ts`, `factories/letter/product.test.ts`
- Modify: `components/Bench.tsx` (product scrubber)

**Interfaces:**
- Consumes: `letterGeometry`, `Looks` (`part`, `own`, `appearance`), `ProductModel`/`ProductHandle`/`ProductCtx`.
- Produces:
  - `LETTER_STAGES`, `LetterStage`, `LetterVisual`, `letterVisual(stage, t)`
  - `letterProduct: ProductModel`
  - Dimensions: `LETTER_H = 26`, `LETTER_R = 2.3`, `PALLET = 46`, `SAND_TOP = 17`

- [ ] **Step 1: Failing visual tests.** `factories/letter/visual.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LETTER_STAGES, letterVisual, type LetterVisual } from './visual';

const KEYS: (keyof LetterVisual)[] = ['sand', 'cavity', 'fill', 'heat', 'flaskOpen', 'sandLeft', 'rough', 'polish'];

describe('letterVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < LETTER_STAGES.length; k++) {
      const a = letterVisual(LETTER_STAGES[k], 1);
      const b = letterVisual(LETTER_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${LETTER_STAGES[k]}→${LETTER_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });
  it('progresses monotonically: fill and polish rise, heat falls after pouring, rough falls', () => {
    let prev = letterVisual('flask', 0);
    for (const s of LETTER_STAGES) for (let i = 0; i <= 10; i++) {
      const v = letterVisual(s, i / 10);
      expect(v.fill).toBeGreaterThanOrEqual(prev.fill - 1e-9);
      expect(v.polish).toBeGreaterThanOrEqual(prev.polish - 1e-9);
      expect(v.rough).toBeLessThanOrEqual(prev.rough + 1e-9);
      if (prev.fill >= 1) expect(v.heat).toBeLessThanOrEqual(prev.heat + 1e-9);
      prev = v;
    }
    expect(prev).toMatchObject({ fill: 1, heat: 0, flaskOpen: 1, sandLeft: 0, rough: 0, polish: 1 });
  });
  it('unknown stage = fresh flask', () => {
    expect(letterVisual('nope', 0.5)).toEqual(letterVisual('flask', 0));
  });
});
```

- [ ] **Step 2: Implement `factories/letter/visual.ts`**

```ts
export const LETTER_STAGES = ['flask', 'moulded', 'poured', 'cooled', 'cast', 'ground', 'polished'] as const;
export type LetterStage = (typeof LETTER_STAGES)[number];

/** Everything the letter product shows, 0..1 each. */
export interface LetterVisual {
  sand: number;      // sand level in the flask
  cavity: number;    // letter-shaped cavity revealed in the sand
  fill: number;      // molten metal filled along the letter (bottom → top)
  heat: number;      // 1 white-hot … 0 cold
  flaskOpen: number; // flask halves slid apart (1 = gone)
  sandLeft: number;  // sand remaining around the casting
  rough: number;     // sprue stub + flash present (1) … ground off (0)
  polish: number;    // raw steel (0) … mirror chrome (1)
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage → visual mapping; letterVisual(S_k, 1) ≡ letterVisual(S_{k+1}, 0). */
export function letterVisual(stage: string, t: number): LetterVisual {
  const base: LetterVisual = { sand: 1, cavity: 1, fill: 1, heat: 1, flaskOpen: 0, sandLeft: 1, rough: 1, polish: 0 };
  switch (stage) {
    case 'moulded': return { ...base, sand: ss(0, 0.35, t), cavity: ss(0.6, 0.9, t), fill: 0 };
    case 'poured': return { ...base, fill: ss(0, 1, t) };
    case 'cooled': return { ...base, heat: 1 - ss(0, 1, t) };
    case 'cast': return { ...base, heat: 0, flaskOpen: ss(0.25, 0.7, t), sandLeft: 1 - ss(0.15, 0.85, t) };
    case 'ground': return { ...base, heat: 0, flaskOpen: 1, sandLeft: 0, rough: 1 - ss(0, 1, t) };
    case 'polished': return { ...base, heat: 0, flaskOpen: 1, sandLeft: 0, rough: 0, polish: ss(0, 1, t) };
    default: return { ...base, sand: 0, cavity: 0, fill: 0 };
  }
}
```

- [ ] **Step 3: Failing product tests.** `factories/letter/product.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks, type LookOptions } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import type { Job } from '../../engine/types';
import { letterProduct, LETTER_STAGES } from './product';

const opts: LookOptions = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' };
const job = (char: string, isSpace = false): Job => ({ id: 1, slotId: 1, char, isSpace, special: 'none', product: 'letter', stage: 'flask', phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 22], defect: false, retries: 0 });
const metal = (root: THREE.Object3D) => root.getObjectByName('metal') as THREE.Mesh;

describe('letterProduct', () => {
  it('stages match the visual table', () => {
    expect(letterProduct.stages).toEqual(LETTER_STAGES);
  });
  it('metal appears during the pour, clipped to the fill level, and ends chrome', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    h.shape('moulded', 1);
    expect(metal(h.root).visible).toBe(false);
    h.shape('poured', 0.5);
    const m = metal(h.root);
    expect(m.visible).toBe(true);
    const mat = m.material as THREE.MeshStandardMaterial;
    expect(mat.clippingPlanes).toHaveLength(1);
    expect(mat.clippingPlanes![0].constant).toBeLessThan(1e5);
    expect(mat.emissiveIntensity).toBeGreaterThan(1);
    h.shape('polished', 1);
    expect(mat.clippingPlanes![0].constant).toBeGreaterThan(1e5);
    expect(mat.metalness).toBeCloseTo(1, 2);
    expect(mat.emissiveIntensity).toBeCloseTo(0, 6);
    expect((h.root.getObjectByName('sprue') as THREE.Mesh).scale.x).toBeCloseTo(0, 6);
  });
  it('restyle preserves fill and heat with a new material', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('g'), { looks, marks: defaultSettings.letterMarks });
    h.shape('poured', 0.5);
    const before = metal(h.root).material as THREE.MeshStandardMaterial;
    const c = before.clippingPlanes![0].constant;
    looks.set({ ...opts, look: 'flat' });
    h.restyle();
    const after = metal(h.root).material as THREE.MeshToonMaterial;
    expect(after).not.toBe(before);
    expect(after.clippingPlanes![0].constant).toBeCloseTo(c, 6);
    expect(after.emissiveIntensity).toBeGreaterThan(0);
  });
  it('place(1) stands the letter upright on z=0 and hides the bed', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    h.shape('polished', 1);
    h.place(1);
    const letter = h.root.getObjectByName('letter')!;
    expect(letter.rotation.x).toBeCloseTo(0, 6);
    expect(h.root.getObjectByName('bed')!.visible).toBe(false);
    h.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(letter);
    expect(b.min.z).toBeGreaterThanOrEqual(-1e-6); // baseline strokes rest on z=0 (R3); sphere tessellation lifts ≤ 0.15
    expect(b.min.z).toBeLessThan(0.25);
  });
  it('a space job is a bare pallet that survives every stage', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('', true), { looks, marks: defaultSettings.letterMarks });
    expect(h.root.getObjectByName('metal')).toBeUndefined();
    for (const s of LETTER_STAGES) for (const t of [0, 0.5, 1]) expect(() => h.shape(s, t)).not.toThrow();
    expect(() => { h.place(0.5); h.restyle(); h.dispose(); }).not.toThrow();
  });
  it('dispose releases the own material', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    const mat = metal(h.root).material as THREE.Material;
    let disposed = false;
    mat.addEventListener('dispose', () => { disposed = true; });
    h.dispose();
    expect(disposed).toBe(true);
  });
});
```

- [ ] **Step 4: Implement `factories/letter/product.ts`**

```ts
import * as THREE from 'three';
import { letterGeometry } from '../../engine/letterSolid';
import type { Looks } from '../../engine/looks';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { LETTER_STAGES, letterVisual } from './visual';

export { LETTER_STAGES };
export const LETTER_H = 26;
export const LETTER_R = 2.3;
export const PALLET = 46;
const PALLET_T = 3;
const SAND_H = 14;
export const SAND_TOP = PALLET_T + SAND_H; // 17
const FLASK_H = 16;
const FLASK_W = 3;

const IRON = new THREE.Color(0x45474b);
const STEEL = new THREE.Color(0x8d9198);
const CHROME = new THREE.Color(0xe9ecf0);
const WHITE_HOT = new THREE.Color(0xfff1c4);
const ORANGE = new THREE.Color(0xff6a10);
const RED = new THREE.Color(0x9a1800);
const BLACK = new THREE.Color(0x000000);

function heatColor(h: number, out: THREE.Color): THREE.Color {
  if (h > 0.66) return out.copy(ORANGE).lerp(WHITE_HOT, (h - 0.66) / 0.34);
  if (h > 0.33) return out.copy(RED).lerp(ORANGE, (h - 0.33) / 0.33);
  return out.copy(BLACK).lerp(RED, h / 0.33);
}

let shared: { pallet: THREE.BufferGeometry; half: THREE.BufferGeometry; sand: THREE.BufferGeometry; sprue: THREE.BufferGeometry } | null = null;
/** Geometries shared by every letter handle (never disposed). */
function geoms() {
  if (shared) return shared;
  const s = PALLET / 2;
  const wall = (w: number, d: number, x: number, y: number) => new THREE.BoxGeometry(w, d, FLASK_H).translate(x, y, PALLET_T + FLASK_H / 2);
  // left half of the flask: the -x wall plus half of the front and back walls (U shape opening toward +x)
  const walls = [wall(FLASK_W, PALLET, -s + FLASK_W / 2, 0), wall(s, FLASK_W, -s / 2, s - FLASK_W / 2), wall(s, FLASK_W, -s / 2, -s + FLASK_W / 2)];
  const half = mergeGeometries(walls, false)!;
  for (const w of walls) w.dispose();
  shared = {
    pallet: new THREE.BoxGeometry(PALLET, PALLET, PALLET_T).translate(0, 0, PALLET_T / 2),
    half,
    sand: new THREE.BoxGeometry(PALLET - 2 * FLASK_W, PALLET - 2 * FLASK_W, SAND_H).translate(0, 0, SAND_H / 2),
    // horizontal stub along -x from its attach point (letter-upright coords)
    sprue: new THREE.CylinderGeometry(LETTER_R * 1.3, LETTER_R * 1.6, 8, 12).rotateZ(Math.PI / 2).translate(-4, 0, 0),
  };
  return shared;
}
```

(import `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`.) The right flask half is the same `half` geometry on a mesh with `scale.x = -1`.

Then implement `LetterHandle` exactly to this behaviour:

```ts
class LetterHandle implements ProductHandle {
  readonly root = new THREE.Group();
  // children by name: 'bed' (pallet, flaskL, flaskR, sand, cavity), 'letter' (metal, sprue, flash)
  // - pallet: looks.part(pallet, 'steel'); flaskL/flaskR: looks.part(half, 'paint-accent') (flaskR.scale.x = -1)
  // - sand: looks.part(sand, 'sand') at z = PALLET_T, scaled z by max(1e-3, v.sand * (0.15 + 0.85 * v.sandLeft)),
  //         x/y by 0.6 + 0.4 * v.sandLeft
  // - cavity: looks.part(letterGeometry(char), 'rubber'); rotation.x = -π/2; scale (v.cavity, 0.15, v.cavity);
  //           position (0, -zMid, SAND_TOP - 0.25); visible = v.cavity > 0.01 && v.sandLeft > 0.5 && v.fill < 1
  // - letter group (name 'letter'): rotation.x = -π/2 while on the line, position.y = -zMid,
  //           position.z = lerp(PALLET_T + LETTER_R, SAND_TOP - 0.4 * LETTER_R, v.sandLeft)
  //     metal (name 'metal'): new THREE.Mesh(letterGeometry(char, {height: LETTER_H, radius: LETTER_R}), mat)
  //           NO userData.role (own material); castShadow/receiveShadow true; visible = v.fill > 0
  //     flash (name 'flash'): Mesh(letterGeometry(char, {height: LETTER_H, radius: LETTER_R * 1.7}), mat), scale.y = 0.22,
  //           scale.x/z = 1, visible = v.rough > 0.01 && v.fill >= 1; when visible scale.y = 0.22 * v.rough
  //     sprue (name 'sprue'): Mesh(sprue, mat) at (bb.min.x + LETTER_R, 0, zMid) in letter-upright coords
  //           (sticks out of the letter's left side), scale = v.rough (all axes, exactly — may be 0),
  //           visible = v.rough > 0.01
  //   bb = letterGeometry(...).boundingBox (cell z kept, ruling R2: min.z may be < 0 for descenders, > 0 for caps)
  //   zMid = (bb.min.z + bb.max.z) / 2; hz = bb.max.z - bb.min.z
  //   BASE_Z = (1 - GLYPH_BASE) * LETTER_H - LETTER_R  (upright: shift z by -BASE_Z so baseline strokes rest on z=0, R3)
  // - mat = looks.own('product'); mat.clippingPlanes = [plane] (plane world-space, normal (0,-1,0))
  // shape(stage, t):
  //   v = letterVisual(stage, t); store [stage, t];
  //   apply the transforms above; flaskL.position.x = -26 * v.flaskOpen, flaskR.position.x = +26 * v.flaskOpen,
  //   both visible = v.flaskOpen < 0.98;
  //   fill plane: this.root.updateWorldMatrix(true, false); y0 = root world y + (letter.position.y + bb.min.z) (flat: the letter's bottom edge in world y);
  //     plane.constant = v.fill >= 1 ? 1e6 : y0 + v.fill * hz   (keeps world y ≤ level)
  //   appearance: color = v.polish > 0 ? STEEL.lerp(CHROME, polish) : STEEL.lerp(IRON, rough);
  //     emissive = heatColor(v.heat * (v.fill > 0 ? 1 : 0)); emissiveIntensity = 3.5 * v.heat * (v.fill > 0 ? 1 : 0);
  //     metalness = 0.5 + 0.5 * v.polish; roughness = v.polish > 0 ? lerp(0.45, 0.1, v.polish) : lerp(0.45, 0.85, v.rough)
  //     → this.ctx.looks.appearance(mat, {...})
  // place(t): store t; e = smoothstep(t); letter.rotation.x = -π/2 * (1 - e); letter.position.y = -zMid * (1 - e);
  //   letter.position.z = (PALLET_T + LETTER_R) * (1 - e) - BASE_Z * e; bed.visible = t <= 0.02
  // restyle(): old = mat; mat = looks.own('product') with clippingPlanes = [plane]; assign to metal/flash/sprue;
  //   old.dispose(); re-run shape(...last); if placed > 0 re-run place(placed)
  // dispose(): mat.dispose(); root.removeFromParent()   (shared/cached geometries are never disposed)
  // space job (job.isSpace): only bed with pallet; no flask/sand/cavity/letter; shape/place only set bed visibility
}

export const letterProduct: ProductModel = {
  kind: 'letter',
  stages: LETTER_STAGES,
  size: [Math.ceil(0.7 * LETTER_H + 2 * LETTER_R), 2 * LETTER_R + 2, LETTER_H + 2 * LETTER_R],
  lineSize: PALLET,
  create: (job: Job, ctx: ProductCtx) => new LetterHandle(job, ctx),
};
```

Note: `place(t)` with `t > 0` must also stop `shape` from moving the letter. Once `placed > 0`, `shape` skips the letter group transform; only `place` controls it.

- [ ] **Step 5: Bench scrubber.** In `components/Bench.tsx` add:
- A third row at y = −360 with 7 letter products (`'A'`), one per stage, each at `shape(stage, 1)`.
- One "live" product in front driven by an HTML range input 0..7. Its integer part picks the stage and its fraction is `t`.
- A text input that sets the char.

- [ ] **Step 6: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`, all green. On the bench, scrubbing must visibly show, in all four looks:
1. The empty flask.
2. Sand fills it.
3. The cavity appears.
4. Glowing metal runs bottom → top.
5. It cools to iron.
6. The flask halves slide off, the sand goes and the letter drops to the pallet.
7. The sprue and flash shrink away.
8. It turns chrome.

```bash
git add -A && git commit -m "feat(letter): cast metal letter product with continuous shape stages"
```

---

### Task 11: Letter stations 1–4 (moulder, pour, cooling tunnel, shakeout)

**Files:**
- Create: `factories/letter/stations/{moulder,pour,cooling,shakeout}.ts`, `factories/letter/stations/testkit.ts` (test helper, imported only by tests)
- Test: `factories/letter/stations.test.ts` (covers 1–4 now, extended in Task 12)

**Interfaces:**
- Consumes: parts kit, `BELT_TOP`, `letterGeometry`, `LETTER_H`, `LETTER_R`, `SAND_TOP`, `PALLET`, `StationDef`, `ProductHandle`, `ParticleSystem.emit`, `AudioBus.play/loop`.
- Produces: `moulder`, `pour`, `cooling`, `shakeout`: `StationDef` with `outputStage` `'moulded' | 'poured' | 'cooled' | 'cast'`.

**Station rules (every station):**
- Build everything in `create(ctx)` under `ctx.group` with `ctx.looks.part` or the parts kit. Local z = 0 is the belt top; the floor is z = −22.
- The station's own base under the product is a housing from the floor to z = −3 (`role: 'paint'`) plus a `hazardBand` around its foot.
- Call `product.shape(OUTPUT, localT)` every frame while the job is inside. At `t = 1`, `localT` must equal 1.
- Particles are emitted in **world** coordinates (`ctx.origin` + local), with `floor: 0`.
- No sounds and no particles for `job.isSpace`. Moving parts may still idle.
- Edge-triggered sounds fire once per job: keep a `fired` set reset in `begin`.
- Ambient loops start in `create` and stop in `destroy`.
- `destroy()` disposes every geometry the station created (not cached letter geometry) and removes children: `ctx.group.clear()`.
- `update(dt, null, 0, null)` = idle: moving parts ease back to rest.

- [ ] **Step 1: Test kit + failing tests.** `factories/letter/stations/testkit.ts`:

```ts
import * as THREE from 'three';
import type { AudioBus } from '../../../audio/bus';
import { Looks } from '../../../engine/looks';
import { ParticleSystem } from '../../../engine/particles';
import type { ProductHandle } from '../../../engine/product';
import { defaultSettings } from '../../../engine/settings';
import type { StationCtx, StationDef } from '../../../engine/station';
import type { Job } from '../../../engine/types';

export function testCtx() {
  const plays: string[] = [];
  const loops: { stopped: boolean }[] = [];
  const audio = {
    play: (n: string) => { plays.push(n); },
    loop: () => { const l = { stopped: false, setGain() {}, stop() { l.stopped = true; } }; loops.push(l); return l; },
  } as unknown as AudioBus;
  const particles = new ParticleSystem();
  const group = new THREE.Group();
  group.position.set(300, -100, 22); // the host positions station groups at their anchor
  const ctx: StationCtx = {
    group, origin: [300, -100, 22],
    looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
    particles, audio, settings: () => defaultSettings, now: () => 0,
    placing: () => [], product: () => null,
    shelfSpan: () => ({ x0: 0, x1: 460, y: -420, z: 18 }),
  };
  return { ctx, plays, loops, particles, group };
}

export function recProduct(): ProductHandle & { shapes: [string, number][] } {
  const h = { root: new THREE.Group(), shapes: [] as [string, number][], shape(s: string, t: number) { h.shapes.push([s, t]); }, place() {}, restyle() {}, dispose() {} };
  return h;
}

export const job = (char: string, isSpace = false): Job => ({ id: 7, slotId: 7, char, isSpace, special: 'none', product: 'letter', stage: 'flask', phase: 'station', stationIndex: 0, progress: 0, pos: [300, -100, 22], defect: false, retries: 0 });

/** Run a full job through a station then 30 idle frames. */
export function runJob(def: StationDef, j: Job) {
  const k = testCtx();
  const inst = def.create(k.ctx);
  const p = recProduct();
  inst.begin(j, p);
  const steps = 60;
  for (let i = 0; i <= steps; i++) inst.update(def.duration / steps, j, i / steps, p);
  const verdict = inst.finish(j);
  for (let i = 0; i < 30; i++) inst.update(1 / 30, null, 0, null);
  return { k, inst, p, verdict };
}
```

`factories/letter/stations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { BELT_W } from '../shared/dims';
import { cooling } from './stations/cooling';
import { moulder } from './stations/moulder';
import { pour } from './stations/pour';
import { shakeout } from './stations/shakeout';
import { job, runJob, testCtx } from './stations/testkit';

const STATIONS: [StationDef, string][] = [[moulder, 'moulded'], [pour, 'poured'], [cooling, 'cooled'], [shakeout, 'cast']];

describe.each(STATIONS)('%s', (def, out) => {
  it('declares its output stage and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    expect(Math.min(...def.footprint)).toBeGreaterThanOrEqual(BELT_W);
  });
  it('shapes the product through its stage, ending at t=1, and passes', () => {
    const r = runJob(def, job('A'));
    expect(r.p.shapes.length).toBeGreaterThan(10);
    expect(r.p.shapes.every(([s]) => s === out)).toBe(true);
    expect(r.p.shapes[r.p.shapes.length - 1][1]).toBeCloseTo(1, 6);
    expect(r.verdict).toBe('pass');
  });
  it('space jobs make no sound and no particles', () => {
    const r = runJob(def, job('', true));
    expect(r.k.plays).toEqual([]);
    expect(r.k.particles.count).toBe(0);
  });
  it('builds geometry, idles without a job, and cleans up on destroy', () => {
    const k = testCtx();
    const inst = def.create(k.ctx);
    expect(k.group.children.length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) inst.update(1 / 30, null, 0, null);
    inst.destroy();
    expect(k.group.children.length).toBe(0);
    expect(k.loops.every((l) => l.stopped)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, and expect "Cannot find module" failures.** `pnpm vitest run factories/letter/stations.test.ts`

- [ ] **Step 3: `moulder.ts`.** `footprint [110, 100]`, `height 120`, `duration 1.6`, `spaceDuration 0.3`, `outputStage 'moulded'`.

Build:
- C-frame: two steel `beam`s as back columns at (±46, 40), z −22 → 92, and a head box (`housing` 104 × 70 × 14, `paint`) at z 78–92, spanning y −30..40.
- Sand hopper: `lathe(looks, [[0, 0], [6, 0], [24, 22], [24, 40], [0, 40]], 'paint')` at (0, 25, 92), with a feed `pipe` from its bottom (0, 25, 92) → (0, 10, 70) → (0, 0, 48), r 3.
- Ram: `piston(looks, { body: 9, rod: 3.5, len: 26, stroke: 50, role: 'steel' })` mounted at (0, 0, 78), with a pattern plate (`housing` 40 × 40 × 4, `steel`) attached to `rodEnd`.
- Pattern: a mesh from `letterGeometry(char, { height: 26, radius: 2.3 })` with `looks.part(geom, 'steel')`, `rotation.x = −π/2`, scaled (1, 0.6, 1), under the plate. `begin` swaps only `pattern.geometry` to the new char's cached geometry; never dispose it.
- Control `panel(looks, 22, 34)` at (62, −20, −22).
- `gauge` on the head front (−30, −31, 85).

Timeline (`t` = job progress):

| t | action |
| --- | --- |
| 0–0.35 | emit `sand` (count 3) from world spout (origin + [0, 0, 46]), `vel [0, 0, −30]`, spread 2 |
| 0.35–0.55 | ram extends: `ext = ss(0.35, 0.55, t)`, rod end reaches z = SAND_TOP + 2 (stroke 50 → reaches 28 from mount 78) |
| 0.55 | `press-thump` once; emit `powder` (count 12) at the plate edge |
| 0.6–0.8 | ram retracts |

Throughout: `product.shape('moulded', t)`. Ambient: `panel.update(now)`, and the gauge set to `0.4 + 0.1 sin(now/700)`. Sound at begin: `pour-sand`.

- [ ] **Step 4: `pour.ts`.** `footprint [130, 110]`, `height 130`, `duration 1.8`, `spaceDuration 0.3`, `outputStage 'poured'`.

Build:
- **Induction furnace** at (40, 32):
  - body `lathe([[0, 0], [22, 0], [22, 46], [19, 50], [0, 50]], 'paint-accent')` from the floor (z −22).
  - copper coil: `pipe` of a helix (8 turns, radius 23.5, z −18 → 22, r 1.6, `copper`).
  - molten pool disc: `lathe([[0, 0], [17, 0], [17, 0.6], [0, 0.6]], 'molten')` at z 27.5.
  - `flange` rim at z 26.
  - **Ingot feeder** (ambient): a small belt `housing` 60 × 14 × 3 (`belt`) at (75, 45, 18); 3 ingots `housing` 10 × 6 × 4 (`steel`) whose x positions cycle with `now` from 100 → 52, then hidden for 0.4 s ("dropped in").
- **Gantry:**
  - two `beam` columns at (−60, 48) and (60, 48), z −22 → 100
  - top beam x −60 → 60 at y 48, z 100
  - trolley `housing` 18 × 18 × 8 riding x
  - hoist cable: a thin `column` (r 0.6, `rubber`) whose length scales to the ladle
  - an arm from the trolley reaching −y to y = 0 (`beam`), so the ladle hangs over the line
- **Ladle** group at the arm tip:
  - bowl `lathe([[0, 0], [10, 0], [13, 10], [13.5, 14], [12, 14], [9.5, 2], [0, 2]], 'steel')`
  - inner molten surface disc (`molten`) at z 11
  - bail `TorusGeometry(15, 1, 8, 24, π)` (`steel`)
  - pour lip toward −x
- **Stream:** a `column` (r 1.6, height 1, `molten`) scaled in z between the lip and the flask top (SAND_TOP); visible only while pouring.

Timeline:

| t | action |
| --- | --- |
| 0–0.2 | trolley x 40 → 6; ladle z 70 → 46 |
| 0.2–0.3 | tilt the ladle group about y to −1.0 rad |
| 0.3 | `hiss` once |
| 0.3–0.8 | stream visible; `product.shape('poured', ss(0.3, 0.8, t))`; emit `glow` (count 1) and `ember` (count 2, vel [0, 0, 25]) at world impact (origin + [0, 0, SAND_TOP]) |
| 0.8–0.9 | untilt |
| 0.9–1 | trolley returns to 40 |

Before 0.3, call `product.shape('poured', 0)`; after 0.8, call `shape('poured', 1)`. Ambient: furnace pool shimmer (scale 1 ± 0.02, no particles; particles only come from job processing). On create: `ctx.audio.loop('furnace-roar', { x: origin[0], gain: 0.4 })`.

- [ ] **Step 5: `cooling.ts`.** `footprint [130, 90]`, `height 70`, `duration 1.7`, `spaceDuration 0.3`, `outputStage 'cooled'`.

Build the tunnel:
- back wall `housing` 120 × 4 × 46 at y 32
- roof `housing` 124 × 70 × 6 at z 46, `paint`
- front: lower lip `housing` 120 × 4 × 6 at y −32 plus a `glass` window panel 120 × 2 × 34 above it (so the glowing letter is seen through it)
- louvres: 10 `box` slats 4 × 60 × 1.5 on the roof, `paint-accent`
- 2 roof fans at x ±30: shroud `lathe` ring plus a 4-blade rotor (boxes 18 × 3 × 0.8, `steel`) spinning at 12 rad/s
- strip curtains at both ends: 6 `rubber` strips 6 × 1 × 40 hanging from the roof, swaying ±0.15 rad when a job is inside
- steam stack `pipe` up from the roof (−50, 20)

Timeline: `product.shape('cooled', t)`; emit `steam` (count 1) from the stack top with probability `1 − t`. `hiss` at begin. Ambient fans spin; `motor-whir` once on create? No: one-shots only on job begin; this station has no loop.

- [ ] **Step 6: `shakeout.ts`.** `footprint [130, 110]`, `height 80`, `duration 1.5`, `spaceDuration 0.3`, `outputStage 'cast'`.

Build:
- vibrating deck group: a grid of 9 `box` bars 70 × 3 × 3 (`steel`) at z −2, on 4 coil springs (helix `pipe` r 0.9, radius 4, 5 turns, z −20 → −4)
- base frame `housing` 90 × 70 × 6 at the floor
- two catch hoppers at x ±56: `lathe` cones upside-down, `paint`, top z −2
- eccentric motor: `column` r 8 on the side at (0, 40, −16), plus a spinning eccentric disc (`gear`)

Timeline:
- t 0.1–0.75: vibration `off = sin(now · 0.09) · 0.8`; `deck.position.z = off`, and the product root z and x get `+off` and `+off · 0.5` (allowed: the host positions the root before `update`).
- t 0.2–0.85: emit `sand` (count 4) around the flask perimeter (world origin ± 20 in x/y, z 12).
- `crunch` at 0.2; `press-thump` at 0.55 (the halves drop into the hoppers).
- Throughout: `product.shape('cast', t)`.

- [ ] **Step 7: Run the tests.** Expect all station tests to pass: `pnpm vitest run factories/letter/stations.test.ts`.

- [ ] **Step 8: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`, all green.

```bash
git add -A && git commit -m "feat(letter): moulder, pour, cooling tunnel and shakeout stations"
```

---

### Task 12: Letter stations 5–7, registry, end-to-end

**Files:**
- Create: `factories/letter/stations/{grinder,polish,robot}.ts`, `factories/letter/index.ts`
- Modify: `factories/registry.ts`, `factories/letter/stations.test.ts`
- Test: robot-specific test in `factories/letter/stations.test.ts`; an end-to-end headless test `factories/letter/e2e.test.ts`

**Interfaces:**
- Consumes: Task 11 rules, `RobotArm`, `ARM`, `WRIST`, `StationCtx.placing/shelfSpan`.
- Produces: `grinder` (`'ground'`), `polish` (`'polished'`), `robot` (no outputStage), `letterFactory: FactoryDef`, and the registry entry `letter`.

- [ ] **Step 1: Extend the station tests.** Add `[grinder, 'ground']` and `[polish, 'polished']` to `STATIONS`. Add the robot block:

```ts
import * as THREE from 'three';
import { robot } from './stations/robot';

describe('robot', () => {
  it('has no output stage, makes no shape calls, and passes', () => {
    expect(robot.outputStage).toBeUndefined();
    const r = runJob(robot, job('A'));
    expect(r.verdict).toBe('pass');
  });
  it('tracks a placing job with its gripper', () => {
    const k = testCtx();
    const placing = { ...job('A'), phase: 'placing' as const, pos: [200, -300, 60] as [number, number, number] };
    k.ctx.placing = () => [placing];
    const inst = robot.create(k.ctx);
    for (let i = 0; i < 240; i++) inst.update(1 / 60, null, 0, null);
    k.group.updateMatrixWorld(true);
    const p = k.group.getObjectByName('robot-tip')!.getWorldPosition(new THREE.Vector3());
    expect(Math.hypot(p.x - 200, p.y + 300)).toBeLessThan(25);
  });
});
```

The robot places its rail and arm by converting world → local with `ctx.origin` (the test kit's group already sits at `ctx.origin`, like the host's).

- [ ] **Step 2: Failing e2e test.** `factories/letter/e2e.test.ts`:

```ts
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
    for (let i = 0; i < 60 * 90 && director.shelf('letter').text() !== 'Hi'; i++) { director.update(1 / 60); host.update(1 / 60, 1 / 60); }
    expect(director.shelf('letter').text()).toBe('Hi');
    const letters = host.shelfView.group.children.filter((c) => c.getObjectByName('letter'));
    expect(letters).toHaveLength(2);
    for (const l of letters) expect(l.getObjectByName('letter')!.rotation.x).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 3: `grinder.ts`.** `footprint [120, 100]`, `height 110`, `duration 1.5`, `spaceDuration 0.3`, `outputStage 'ground'`.

Build:
- two back columns (`beam`) at (±50, 38), z −22 → 80
- a cross rail `beam` at z 72
- a carriage `housing` 20 × 20 × 14 (`paint`) sliding on x
- a vertical slide: `piston` (body 6, rod 3, len 20, stroke 50)
- a motor housing `column` r 8 len 22, lying along y, `paint`, at the rod end
- abrasive wheel: `CylinderGeometry(12, 12, 5, 32)` rotated so its axis is along y, role `concrete`, spinning at 40 rad/s
- half-guard `lathe` arc (`paint-accent`)
- a `panel` at the side

Timeline:

| t | action |
| --- | --- |
| 0–0.2 | slide down until the wheel bottom touches z = PALLET_T + 2·LETTER_R + 0.5 (the flat letter's top) |
| 0.2–0.85 | carriage x = −14 + 28 · triangle-wave(2 passes); `product.shape('ground', ss(0.2, 0.85, t))`; emit `spark` (count 3, vel [0, −60, 40], spread 3) at the world contact point |
| 0.85–1 | lift |

Before 0.2 call `shape('ground', 0)`; after 0.85, `shape('ground', 1)`. Sound at begin: `motor-whir`. Ambient: the wheel always spins (slower when idle).

- [ ] **Step 4: `polish.ts`.** `footprint [120, 100]`, `height 100`, `duration 1.6`, `spaceDuration 0.3`, `outputStage 'polished'`.

Build:
- two buffing heads on swing arms from pedestals at x ±52 (`column` r 6 to z 30)
- each arm is a `beam` that pivots about z
- buff = `lathe` disc r 11, thickness 6 (`sand` role, cotton), with its axis along x, spinning at 30 rad/s
- a plating spray boom overhead (`pipe` from the back to a nozzle at (0, 0, 40)) with a nozzle `lathe` cone

Timeline:

| t | action |
| --- | --- |
| 0–0.2 | arms swing in so the buffs touch the letter ends (x ±12, z 6) |
| 0.2–0.8 | buffs oscillate y ±8; `product.shape('polished', ss(0.2, 0.85, t))`; emit `powder` (count 2) at the contacts |
| 0.45–0.6 | spray: emit `steam` (count 2, vel [0, 0, −40]) from the nozzle; `hiss` at 0.45 |
| 0.8–1 | arms swing out |

Sound at begin: `motor-whir`.

- [ ] **Step 5: `robot.ts`.** `footprint [90, 80]`, `height 60`, `duration 1.1`, `spaceDuration 0.3`, no `outputStage`.

Build:
- **Rail:** in `create`, read `span = ctx.shelfSpan()`; `railY = span.y + 60`. The rail x-range is `[min(span.x0, ox) − 30, max(span.x1, ox) + 30]` (world), where `[ox, oy] = ctx.origin`.
  - Convert to local by subtracting `ctx.origin` (local z of the floor = −BELT_TOP).
  - The rail is two parallel `beam`s (`steel`, size 5) at floor + 3, plus sleepers every 40 (`box`, `rubber`).
- **Carriage** `housing` 48 × 40 × 8 (`paint`) on the rail.
- **Arm:** `new RobotArm(looks)` mounted on the carriage (arm base at the carriage top). Name the arm's tip object `'robot-tip'` (`arm.tip.name = 'robot-tip'`).
- A small pick table under the line end is not needed (the product sits on the belt).

**Behaviour each frame:** pick the IK target in world coordinates, then convert to arm-local by subtracting the arm base's world position.
- If `placing` has jobs: track the **oldest** placing job `p`.
  - Target = `p.pos + [0, 0, grip]`, where `grip = lerp(PALLET_T + 2·LETTER_R + 2, LETTER_H + 2·LETTER_R, ss(0, 1, p.progress))`.
  - `arm.grip(1)`.
  - The carriage x damps toward `clamp(p.pos[0])` along the rail.
- Else if `job` is inside the station (not a space):
  - 0–0.5: the tip goes to above the product (`job.pos + [0, 0, 30]`).
  - 0.5–0.8: descend to `job.pos + [0, 0, PALLET_T + 2·LETTER_R + 2]`.
  - Grip closes over 0.7–0.9.
  - The carriage x damps toward the job x.
  - Sound `robot-servo` at begin (not space).
- Else idle: the tip rests at (carriage x, railY − 20, 90) world; `arm.grip(0)`.
- The carriage x damps with rate 4; `arm.reach(localTarget, dt, 10)`.

`finish` → `'pass'`.

- [ ] **Step 6: `factories/letter/index.ts` and the registry**

```ts
import type { FactoryDef } from '../../engine/factory';
import { letterProduct } from './product';
import { cooling } from './stations/cooling';
import { grinder } from './stations/grinder';
import { moulder } from './stations/moulder';
import { polish } from './stations/polish';
import { pour } from './stations/pour';
import { robot } from './stations/robot';
import { shakeout } from './stations/shakeout';

export const letterFactory: FactoryDef = {
  kind: 'letter',
  label: 'Cast metal letter',
  product: letterProduct,
  stations: [moulder, pour, cooling, shakeout, grinder, polish, robot],
};
```

`factories/registry.ts`: `export const FACTORIES: Partial<Record<ProductKind, FactoryDef>> = { letter: letterFactory };`

- [ ] **Step 7: Run all tests.** `pnpm vitest run`. Expected: all pass, including the e2e. If the e2e times out at 90 simulated seconds, check the station durations and `CONVEYOR_SPEED`; do not raise the timeout above 90 s.

- [ ] **Step 8: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`, all green.

```bash
git add -A && git commit -m "feat(letter): grinder, polish, rail robot; register cast letter factory"
```

- [ ] **Step 9: Visual acceptance (controller, not the implementer).**
- `pnpm dev`, open `/`, type `Hello`.
- Screenshot at 1280×800 in each look (realistic, lineart, flat, cutaway), mid-flight and after shelving.
- Check:
  - every station visibly changes the product
  - letters land on the shelf in order, upright and chrome
  - backspace removes the last letter
  - Enter starts a new row
  - a 20-letter burst stays near 60 fps (Performance panel)
- Fix any findings in a review round before marking the task complete.

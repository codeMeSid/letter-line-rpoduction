# Campus Foundation + Shared Extras: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single cast-letter factory into a campus with one plot per product. The user picks the active factory in the HUD and the camera flies there. This plan also builds the shared extras every later factory plugs into:
- shotgun backspace with per-product shatter
- reject hoist and chute
- debris and broom
- forklift row shipping
- workers
- day/night

**Architecture:**
- **Pure logic, node-tested:** campus plots, flight maths, the backspace decision table, sky, patrol loops, and director/shelf changes.
- **Per-factory surroundings:** a `FactorySite` (`fx/site.ts`) owns the building shell, hoist, chute bin, broom, forklift and workers. It is rebuilt after a relayout.
- **Global fx:** a `Destroyer` (`fx/destroyer.ts`) is the director's `BackspaceHandler`. It owns the shared shotgun and fragment pool.
- **Unbuilt kinds:** shown as `ConstructionSite`s (`fx/construction.ts`).

**Tech Stack:** Next 15.5 + React 19, TypeScript 5.9 strict, pnpm, vitest 5 (node env), `three@0.186.1`, zustand 5.

**Spec:** `docs/superpowers/specs/2026-10-17-campus-foundation-design.md` (binding). It builds on `docs/superpowers/specs/2026-10-16-3d-factory-design.md`. Read both before any task.

**Numbering:** Tasks continue from the metal-letter plan (Tasks 5–12), so this plan runs Tasks 13–18.

**Deliberate deviations from the spec:** the plot's left pad is 110, not 70. The spec text is already corrected. The `all` layout's left U-turn sits 30 left of the origin, and the floor pad is 70 on top of that.

## Global Constraints

- No new runtime dependency. Import three addons as `three/addons/<path>.js`.
- **World is z-up.** The viewer stands at −y; +x reads left→right; the shelf is in front of the line (−y). The floor top is world z = 0. Station local z = 0 is the belt top (`BELT_TOP` = 22).
- **Materials:** meshes are created only through `looks.part(geom, role)`, the parts kit, or `new THREE.InstancedMesh(geom, looks.material(role), n)` with `userData.role = role`. No `new THREE.*Material` outside `engine/looks.ts`. fx and buildings never use `looks.own()`; `looks.apply(scene)` restyles them.
- **Scale:** a person is about 42 world units tall and the belt top is 22 (about 0.9 m).
- **One rAF loop** (`engine/loop.ts`). fx advance only from `update(dt)` calls made by `components/Scene.tsx`. No timers, no CSS animation.
- **Particles:** stations emit only while processing a non-space job (unchanged). fx may emit particles **only as part of a user-triggered event**: shot, shatter, sweep. No ambient particles anywhere: no chimney smoke, no idle dust.
- **Sound** only via `audio/bus.ts` (`play(name, { x })`). Every name used must be in `SOUND_NAMES` (`audio/types.ts`). It already has `shotgun-rack`, `shotgun-blast`, `metal-crumple`, `reject-kick`, `broom-sweep`, `forklift-beep`, `forklift-motor`, `whoosh` and `factory-bell`.
- **fx timing is real time** (`realDt`), not sim time. Only the active factory's site updates. The shared shotgun and fragments always update.
- **Pure and node-testable:** `engine/{campus,backspace,dayNight,patrol}.ts`, plus `Director` and `Shelf`. Three scene graphs are fine in node tests; `WebGLRenderer` is never constructed in tests.
- **Imports:** everything under `engine/`, `factories/`, `shelf/`, `audio/`, `lib/`, `hud/`, `fx/` uses **relative** imports (vitest has no `@/` alias). `app/` and `components/` may use `@/`.
- **Cutaway:** building meshes carry `userData.cut = true`, so the front walls are sliced away. fx meshes are not tagged.
- **Before every commit:** `pnpm typecheck && pnpm test && pnpm build` all pass. Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No inline `style=` in React. HUD styling lives in `app/globals.css`.
- **Perf budget:** 60 fps with one active factory and 20 products in flight at 1280×800 on an M-series laptop.
- **User bar:** real machinery and scenery, recognisable at a glance, never placeholder boxes. Every builder below lists the parts it must have.

## Review Focus

1. **Backspace spam during fx.** Five fast backspaces over shelved `abcde` queue five shots. Each slot is removed exactly once, the text ends `''`, and nothing throws. Pinned in Task 15 (`rapid backspaces`).
2. **Busy row.** A backspace that meets a newline row holding only dying slots retries after the next removal, and typing cancels the retry. Pinned in Task 13 (director `busy` test).
3. **Layout switch while fx are running.** A broom sweep or forklift trip in progress must still finish and remove or ship its slot or row after `FactorySite.rebuild()`. Pinned in Task 16 (`relayout mid-sweep`) and Task 17 (`relayout mid-fetch`).
4. **Typing faster than the forklift.** Six quick rows end at three. No in-flight job is ever destroyed by shipping, because `slotPos` is never null for an in-flight job. Pinned in Task 17 (`overflow catches up`).
5. **Product switch mid-flight.** A second switch restarts the flight from the current pose with no jump. A paused factory's jobs freeze and resume. Pinned in Task 13 (director `only the active factory runs`) and Task 14 (`fly twice`).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `engine/types.ts` | modify | new `ProductKind` list, `LAYOUT_MODES` |
| `engine/settings.ts` (+test) | modify | drop `forklift` |
| `lib/share.ts` (+test) | modify | drop `forklift` validator, new kinds |
| `engine/campus.ts` (+test) | create | `campusLayout`, `flightPose`, campus constants |
| `engine/backspace.ts` (+test) | create | `planBackspace` decision table |
| `engine/dayNight.ts` (+test) | create | `skyAt`, `skyAtTime` |
| `engine/patrol.ts` (+test) | create | `patrolLoop`, `loopLength`, `sampleLoop` |
| `engine/director.ts` (+test) | modify | active-only tick, pending backspace, `shipRow`, plain Enter |
| `engine/product.ts` | modify | `ShatterStyle`, `ProductModel.shatter` |
| `shelf/model.ts` (+test) | modify | `SHELF_COLS`, `SHELF_ROWS`, `readyToShip` |
| `shelf/view.ts` (+test) | modify | `shelfWidth` (T13), `release` (T15), per-row planks + `releaseRow` (T17) |
| `factories/registry.ts` (+test) | modify | `PLOTS`, `plotOf`, `plotWidth`, `factoryOrigin` from the campus |
| `factories/letter/product.ts` | modify | letter `shatter` style |
| `engine/factoryHost.ts` (+test) | modify | `FLOOR_PAD` export, dock pad, `floorBox()` (T14), `release()` (T15) |
| `engine/camera.ts` (+test) | modify | `fly`, `flying`, `shake` |
| `engine/stage.ts` | modify | flash light + `tick` (T15), `setSky` (T18) |
| `factories/shared/building.ts` (+test) | create | building shell + anchors + night lights |
| `factories/shared/figure.ts` (+test) | create | worker figure (T17 driver, T18 workers) |
| `fx/ground.ts` (+test) | create | campus slab, roads |
| `fx/construction.ts` (+test) | create | construction site for unbuilt plots |
| `fx/site.ts` (+test) | create | `FactorySite` per built factory |
| `fx/fragments.ts` (+test) | create | pooled flying chunks + debris piles |
| `fx/shotgun.ts` (+test) | create | shared shotgun |
| `fx/destroyer.ts` (+test) | create | `BackspaceHandler` implementation |
| `fx/hoist.ts` (+test) | create | reject claw + chute bin |
| `fx/broom.ts` (+test) | create | shelf broom robot |
| `fx/forklift.ts` (+test) | create | forklift row shipping |
| `fx/workers.ts` (+test) | create | patrolling workers |
| `fx/testkit.ts` | create | tests only: mini factory def, fake audio |
| `components/Scene.tsx` | modify | campus wiring, flight, sites, destroyer, sky |
| `hud/Hud.tsx` | modify | product picker, backspace options, day/night, workers |
| `CLAUDE.md` | modify (T18) | architecture: campus, `fx/` |

---

### Task 13: Pure groundwork (kinds, campus, backspace plan, sky, patrol, director, shelf, shatter type)

**Files:**
- Modify:
  - `engine/types.ts`, `engine/settings.ts`, `engine/settings.test.ts`
  - `lib/share.ts`, `lib/share.test.ts`
  - `engine/director.ts`, `engine/director.test.ts`
  - `shelf/model.ts`, `shelf/model.test.ts`, `shelf/view.ts`
  - `engine/product.ts`, `factories/letter/product.ts`, `factories/registry.ts`
  - `engine/factoryHost.ts` (export `FLOOR_PAD` only), `engine/factoryHost.test.ts` (fixture only), every other test/bench `ProductModel` literal
- Create:
  - `engine/campus.ts`, `engine/campus.test.ts`
  - `engine/backspace.ts`, `engine/backspace.test.ts`
  - `engine/dayNight.ts`, `engine/dayNight.test.ts`
  - `engine/patrol.ts`, `engine/patrol.test.ts`
  - `factories/registry.test.ts`

**Interfaces:**
- Consumes: `Shelf`, `Slot`, `NewlineMarker` (`shelf/model.ts`), `Job`, `Director`, `layoutStations`, `ParticleKind`, `MaterialRole`, `SoundName`.
- Produces (later tasks rely on these exact names):
  - `PRODUCT_KINDS = ['letter','bottle','cookie','donut','mug','can','car']`, `LAYOUT_MODES`
  - `campusLayout`, `flightPose`, `Plot`, `Pose`, `PlotSpec`, `ROAD`, `PAD_LEFT`, `PAD_RIGHT`, `SITE_SIZE`, `SITE_Y0`, `FLIGHT_MS`
  - `planBackspace`, `BackspacePlan`
  - `skyAt`, `skyAtTime`, `Sky`, `NOON`, `DAY_SHARE`, `SUN_NOON`, `SUN_COLOR`
  - `patrolLoop`, `loopLength`, `sampleLoop`
  - `Director.shipRow(kind)`
  - `Shelf.readyToShip(keep?)`, `SHELF_COLS`, `SHELF_ROWS`
  - `shelfWidth(size)`, `FLOOR_PAD`
  - `PLOTS`, `plotOf`, `plotWidth`, `factoryOrigin`
  - `ShatterStyle`, `ProductModel.shatter`

- [ ] **Step 1: Kinds, settings, share.**

`engine/types.ts`: replace the kind type and list, and add `LAYOUT_MODES`:

```ts
export type ProductKind = 'letter' | 'bottle' | 'cookie' | 'donut' | 'mug' | 'can' | 'car';
// ...
/** Campus order = build order (spec "Product kinds"). */
export const PRODUCT_KINDS: readonly ProductKind[] = ['letter', 'bottle', 'cookie', 'donut', 'mug', 'can', 'car'];
export const LAYOUT_MODES: readonly LayoutMode[] = ['snake', 'pan', 'stacked', 'all'];
```

`engine/settings.ts`: delete `forklift: boolean;` and `forklift: false,`. `engine/settings.test.ts`: delete `forklift: false, ` from the expected defaults.

`lib/share.ts`: delete the `forklift: isBool,` validator line. `lib/share.test.ts`:
- line 15: loop over `['letter', 'bottle', 'cookie', 'donut', 'mug', 'can', 'car'] as const`
- line 47: `encodeShare({ product: 'car', text: 'a', settings: { ...defaultSettings, product: 'donut' } })`
- line 49: expect `'p=car'`

Keep the `{"theme":"neon"}` and `{"look":"neon"}` invalid-value cases as they are; they test values, not kinds.

- [ ] **Step 2: Write the failing campus test** `engine/campus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { campusLayout, flightPose, PAD_LEFT, ROAD, type Pose } from './campus';

describe('campusLayout', () => {
  it('places plots left to right, ROAD apart, factory origin PAD_LEFT in', () => {
    const p = campusLayout([{ kind: 'letter', width: 1500, built: true }, { kind: 'bottle', width: 900, built: false }]);
    expect(p.map((q) => [q.x0, q.x1])).toEqual([[0, 1500], [1500 + ROAD, 2400 + ROAD]]);
    expect(p[0].origin).toEqual([PAD_LEFT, 0, 0]);
    expect(p[1].origin).toEqual([1500 + ROAD + PAD_LEFT, 0, 0]);
    expect(p.map((q) => q.built)).toEqual([true, false]);
  });
});

describe('flightPose', () => {
  const a: Pose = { target: [0, 0, 0], extent: 300 };
  const b: Pose = { target: [3000, -100, 0], extent: 400 };
  it('starts at A and ends at B', () => {
    expect(flightPose(0, a, b, 2000)).toEqual(a);
    expect(flightPose(1, a, b, 2000)).toEqual(b);
  });
  it('pulls out on A, is wide and halfway at mid-pan, pushes in on B', () => {
    expect(flightPose(0.2, a, b, 2000).target).toEqual(a.target);
    expect(flightPose(0.25, a, b, 2000).extent).toBe(2000);
    const m = flightPose(0.5, a, b, 2000);
    expect(m.extent).toBe(2000);
    expect(m.target[0]).toBeCloseTo(1500, 6);
    expect(m.target[1]).toBeCloseTo(-50, 6);
    expect(flightPose(0.8, a, b, 2000).target).toEqual(b.target);
  });
  it('is continuous and clamps u', () => {
    let prev = flightPose(0, a, b, 2000);
    for (let i = 1; i <= 1000; i++) {
      const p = flightPose(i / 1000, a, b, 2000);
      expect(Math.abs(p.extent - prev.extent)).toBeLessThan(20);
      expect(Math.abs(p.target[0] - prev.target[0])).toBeLessThan(20);
      prev = p;
    }
    expect(flightPose(-1, a, b, 2000)).toEqual(a);
    expect(flightPose(7, a, b, 2000)).toEqual(b);
  });
});
```

Run `pnpm vitest run engine/campus.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `engine/campus.ts`:

```ts
import type { ProductKind, Vec3 } from './types';

export const ROAD = 160;        // road between neighbouring plots
/** Plot left edge → factory origin. The `all` layout's left U-turn sits 30 left of the origin, plus the 70 floor pad. */
export const PAD_LEFT = 110;
export const PAD_RIGHT = 260;   // last machine/shelf → plot right edge (forklift dock)
export const SITE_SIZE: [number, number] = [900, 700]; // unbuilt plot (construction site)
/** Construction sites span y SITE_Y0 .. SITE_Y0 + SITE_SIZE[1] (about the band the built floors cover). */
export const SITE_Y0 = -560;
export const FLIGHT_MS = 2400;

export interface PlotSpec { kind: ProductKind; width: number; built: boolean }
export interface Plot { kind: ProductKind; x0: number; x1: number; built: boolean; origin: Vec3 }
export interface Pose { target: Vec3; extent: number }

/** Plots side by side along +x in the given order, ROAD apart; the factory origin sits PAD_LEFT in from the plot edge. */
export function campusLayout(specs: readonly PlotSpec[]): Plot[] {
  const out: Plot[] = [];
  let x = 0;
  for (const s of specs) {
    out.push({ kind: s.kind, x0: x, x1: x + s.width, built: s.built, origin: [x + PAD_LEFT, 0, 0] });
    x += s.width + ROAD;
  }
  return out;
}

const ss = (t: number) => t * t * (3 - 2 * t);
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Camera flight, u = 0..1: pull out on A (first 25%), pan A→B at `wide` (middle 50%), push in on B (last 25%). */
export function flightPose(u: number, a: Pose, b: Pose, wide: number): Pose {
  const t = Math.min(1, Math.max(0, u));
  if (t < 0.25) return { target: [...a.target], extent: a.extent + (wide - a.extent) * ss(t / 0.25) };
  if (t < 0.75) return { target: mix(a.target, b.target, ss((t - 0.25) / 0.5)), extent: wide };
  return { target: [...b.target], extent: wide + (b.extent - wide) * ss((t - 0.75) / 0.25) };
}
```

Run the test. Expected: PASS.

- [ ] **Step 4: Failing backspace-plan test** `engine/backspace.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Slot } from '../shelf/model';
import { planBackspace } from './backspace';
import type { Job, JobPhase } from './types';

const slot = (o: Partial<Slot> = {}): Slot => ({ id: 1, kind: 'char', char: 'a', state: 'reserved', jobId: 9, ...o });
const job = (phase: JobPhase): Job => ({
  id: 9, slotId: 1, char: 'a', isSpace: false, special: 'none', product: 'letter', stage: 'x', phase,
  stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0,
});

describe('planBackspace (spec decision table)', () => {
  it('newline marker → newline', () => {
    expect(planBackspace({ kind: 'newline' }, null, 'reject')).toEqual({ type: 'newline' });
  });
  it('queued job or no job → quiet', () => {
    expect(planBackspace(slot(), job('queued'), 'shoot').type).toBe('quiet');
    expect(planBackspace(slot({ jobId: null }), null, 'reject').type).toBe('quiet');
  });
  it('space still in flight → quiet; shelved space → gap', () => {
    expect(planBackspace(slot({ kind: 'space', char: '' }), job('conveyor'), 'shoot').type).toBe('quiet');
    expect(planBackspace(slot({ kind: 'space', char: '', state: 'filled' }), null, 'shoot').type).toBe('gap');
  });
  it('char on the line: reject mode → reject, shoot mode → shoot-line', () => {
    for (const ph of ['conveyor', 'station'] as JobPhase[]) {
      expect(planBackspace(slot(), job(ph), 'reject')).toEqual({ type: 'reject', slot: slot(), jobId: 9 });
      expect(planBackspace(slot(), job(ph), 'shoot')).toEqual({ type: 'shoot-line', slot: slot(), jobId: 9 });
    }
  });
  it('char arcing to the shelf is always shot', () => {
    expect(planBackspace(slot(), job('placing'), 'reject').type).toBe('shoot-line');
  });
  it('shelved char → shoot-shelf', () => {
    expect(planBackspace(slot({ state: 'filled' }), null, 'reject')).toEqual({ type: 'shoot-shelf', slot: slot({ state: 'filled' }) });
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 5: Implement** `engine/backspace.ts`:

```ts
import type { NewlineMarker, Slot } from '../shelf/model';
import type { Job } from './types';

export type BackspacePlan =
  | { type: 'newline' }
  | { type: 'quiet'; slot: Slot }                       // never-seen job, or a space still in flight: no fx
  | { type: 'gap'; slot: Slot }                         // shelved space: broom taps it
  | { type: 'reject'; slot: Slot; jobId: number }       // char on the line, reject mode: hoist → chute
  | { type: 'shoot-line'; slot: Slot; jobId: number }   // char on the line (shoot mode) or arcing to the shelf
  | { type: 'shoot-shelf'; slot: Slot };                // shelved char

/** Binding decision table (spec "Backspace"). `job` = the slot's in-flight job, or null. */
export function planBackspace(target: Slot | NewlineMarker, job: Job | null, inflight: 'reject' | 'shoot'): BackspacePlan {
  if (target.kind === 'newline') return { type: 'newline' };
  const slot = target;
  if (slot.state === 'filled') return slot.kind === 'space' ? { type: 'gap', slot } : { type: 'shoot-shelf', slot };
  if (!job || job.phase === 'queued' || slot.kind === 'space') return { type: 'quiet', slot };
  if (job.phase === 'placing' || inflight === 'shoot') return { type: 'shoot-line', slot, jobId: job.id };
  return { type: 'reject', slot, jobId: job.id };
}
```

Run it. Expected: PASS.

- [ ] **Step 6: Failing sky test** `engine/dayNight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DAY_SHARE, NOON, SUN_COLOR, SUN_NOON, skyAt, skyAtTime } from './dayNight';

describe('skyAt', () => {
  it('noon is exactly today\'s fixed lighting', () => {
    const s = skyAt(NOON);
    s.sunDir.forEach((v, i) => expect(v).toBeCloseTo(SUN_NOON[i], 12));
    expect(s).toMatchObject({ sunColor: SUN_COLOR, sunScale: 1, hemiScale: 1, night: 0 });
    expect(SUN_COLOR).toBe(0xfff4e6);
  });
  it('mid-night is full night with the dim moon', () => {
    const s = skyAt((DAY_SHARE + 1) / 2);
    expect(s.night).toBe(1);
    expect(s.sunScale).toBeCloseTo(0.25, 9);
  });
  it('dusk and dawn edges are half night', () => {
    expect(skyAt(DAY_SHARE).night).toBeCloseTo(0.5, 9);
    expect(skyAt(0).night).toBeCloseTo(0.5, 9);
  });
  it('is continuous, including the wrap at 1 → 0', () => {
    let prev = skyAt(0);
    for (let i = 1; i <= 5001; i++) {
      const s = skyAt((i / 5000) % 1);
      expect(Math.abs(s.night - prev.night)).toBeLessThan(0.03);
      expect(Math.abs(s.sunScale - prev.sunScale)).toBeLessThan(0.03);
      expect(Math.hypot(...s.sunDir.map((v, k) => v - prev.sunDir[k]))).toBeLessThan(0.05);
      expect(Math.hypot(...s.sunDir)).toBeCloseTo(1, 9);
      expect(s.sunDir[2]).toBeGreaterThan(0);
      prev = s;
    }
  });
});

describe('skyAtTime', () => {
  it('starts at noon; off = fixed noon', () => {
    expect(skyAtTime(0, true)).toEqual(skyAt(NOON));
    expect(skyAtTime(999, false)).toEqual(skyAt(NOON));
    expect(skyAtTime(60, true).night).toBeGreaterThan(0.5); // noon + half a cycle is night
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 7: Implement** `engine/dayNight.ts`:

```ts
import type { Vec3 } from './types';

export const DAY_SECONDS = 120;   // one full day, real time
export const DAY_SHARE = 0.6;     // u in [0, DAY_SHARE) is day
export const NOON = DAY_SHARE / 2;
const TWILIGHT = 0.05;            // u-width of the dusk/dawn blend on each side of an edge

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
/** Today's fixed sun (engine/stage.ts): noon must reproduce it exactly. */
export const SUN_NOON: Vec3 = norm([-0.45, -0.6, 1]);
export const SUN_COLOR = 0xfff4e6;
const DAWN_COLOR = 0xffa463;
const MOON_COLOR = 0x9fb4ff;
const MOON_DIR: Vec3 = norm([0.35, -0.7, 0.8]);
const MOON_SCALE = 0.25;
const NIGHT_HEMI = 0.35;
const NOON_AZ = Math.atan2(SUN_NOON[1], SUN_NOON[0]);
const NOON_EL = Math.asin(SUN_NOON[2]);
const LOW_EL = (8 * Math.PI) / 180;
const SWEEP = Math.PI * 0.45;     // azimuth swing either side of noon (left in the morning, right in the evening)

export interface Sky {
  sunDir: Vec3;      // unit, target → light
  sunColor: number;  // hex
  sunScale: number;  // × the look's sun intensity
  hemiScale: number; // × the look's hemisphere intensity
  night: number;     // 0 day … 1 night
}

const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function mixHex(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 0 by day, 1 by night; 0.5 exactly at dusk (u = DAY_SHARE) and dawn (u = 0 ≡ 1); C1 across both edges. */
function nightness(u: number): number {
  if (u < DAY_SHARE) return 0.5 * (1 - ss(0, TWILIGHT, Math.min(u, DAY_SHARE - u)));
  return 0.5 + 0.5 * ss(0, TWILIGHT, Math.min(u - DAY_SHARE, 1 - u));
}

/** Sky at day-phase u in [0, 1). */
export function skyAt(u: number): Sky {
  const w = ((u % 1) + 1) % 1;
  // sun progress through the day; on the night side it stays parked at the nearer edge (dusk 1, dawn 0)
  const d = w < DAY_SHARE ? w / DAY_SHARE : w - DAY_SHARE < 1 - w ? 1 : 0;
  const arc = Math.sin(Math.PI * d);
  const az = NOON_AZ + (d - 0.5) * 2 * SWEEP;
  const el = LOW_EL + (NOON_EL - LOW_EL) * arc;
  const day: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const dayScale = 0.4 + 0.6 * arc;
  const dayHemi = 0.75 + 0.25 * arc;
  const n = nightness(w);
  return {
    sunDir: n === 0 ? day : norm([day[0] + (MOON_DIR[0] - day[0]) * n, day[1] + (MOON_DIR[1] - day[1]) * n, day[2] + (MOON_DIR[2] - day[2]) * n]),
    sunColor: mixHex(mixHex(DAWN_COLOR, SUN_COLOR, arc), MOON_COLOR, n),
    sunScale: dayScale + (MOON_SCALE - dayScale) * n,
    hemiScale: dayHemi + (NIGHT_HEMI - dayHemi) * n,
    night: n,
  };
}

/** Sky `sec` real seconds after load; the cycle starts at noon. `on = false` holds noon. */
export function skyAtTime(sec: number, on: boolean): Sky {
  return skyAt(on ? NOON + sec / DAY_SECONDS : NOON);
}
```

Run it. Expected: PASS. If `sunDir[2] > 0` fails anywhere, it is the dawn/moon blend. Both `day` and `MOON_DIR` have z > 0, so their mix does too; check the formula.

- [ ] **Step 8: Failing patrol test** `engine/patrol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loopLength, patrolLoop, sampleLoop } from './patrol';

describe('patrol', () => {
  const pts = patrolLoop([0, -100, 0], [400, 0, 90], 45);
  it('is the inflated rectangle front-left → front-right → back-right → back-left at floor height', () => {
    expect(pts).toEqual([[-45, -145, 0], [445, -145, 0], [445, 45, 0], [-45, 45, 0]]);
    expect(loopLength(pts)).toBe(2 * (490 + 190));
  });
  it('samples by arc length with wrap and heading', () => {
    expect(sampleLoop(pts, 0)).toEqual({ pos: [-45, -145, 0], heading: 0 });
    expect(sampleLoop(pts, 100).pos).toEqual([55, -145, 0]);
    expect(sampleLoop(pts, 490 + 10)).toEqual({ pos: [445, -135, 0], heading: Math.PI / 2 });
    expect(sampleLoop(pts, loopLength(pts) + 100).pos).toEqual([55, -145, 0]);
    expect(sampleLoop(pts, -10).pos).toEqual([-45, -135, 0]);
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 9: Implement** `engine/patrol.ts`:

```ts
import type { Vec3 } from './types';

/** Closed loop (front-left → front-right → back-right → back-left) around [min, max] inflated by `margin`, at height z. */
export function patrolLoop(min: Vec3, max: Vec3, margin: number, z = 0): Vec3[] {
  const x0 = min[0] - margin, x1 = max[0] + margin, y0 = min[1] - margin, y1 = max[1] + margin;
  return [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
}

const segLen = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function loopLength(pts: readonly Vec3[]): number {
  let L = 0;
  for (let i = 0; i < pts.length; i++) L += segLen(pts[i], pts[(i + 1) % pts.length]);
  return L;
}

/** Position and heading (atan2 of the travel direction in xy) at arc length s along the closed loop; s wraps, negative is fine. */
export function sampleLoop(pts: readonly Vec3[], s: number): { pos: Vec3; heading: number } {
  const L = loopLength(pts);
  let r = ((s % L) + L) % L;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const seg = segLen(a, b);
    if (r < seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, r / seg) : 0;
      return { pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    r -= seg;
  }
  return { pos: [...pts[0]], heading: 0 };
}
```

Run it. Expected: PASS. At s = 490 exactly, r < seg is false, so the sample falls through to the next segment with heading π/2. That is intended.

- [ ] **Step 10: Shelf constants + `readyToShip`.** In `shelf/model.ts`:

```ts
export const SHELF_COLS = 14;
/** Rows the tray keeps; one more makes the forklift fetch the oldest (spec "Forklift"). */
export const SHELF_ROWS = 3;
// class Shelf:
  cols = SHELF_COLS;
  /** Forklift: more than `keep` rows and the oldest row completely filled (nothing still in flight to it). */
  readyToShip(keep = SHELF_ROWS): boolean {
    return this.rows.length > keep && this.rows[0].every((s) => s.state === 'filled');
  }
```

Add to `shelf/model.test.ts`:

```ts
describe('readyToShip', () => {
  const fill = (s: Shelf, n: number) => { for (let i = 0; i < n; i++) s.markFilled(s.reserve('char', 'x').slotId); };
  it('needs more than SHELF_ROWS rows and a fully filled oldest row', () => {
    const s = new Shelf();
    fill(s, 2); s.newline(); fill(s, 1); s.newline(); fill(s, 1);
    expect(s.readyToShip()).toBe(false);          // 3 rows
    s.newline();
    expect(s.readyToShip()).toBe(true);           // 4 rows, row 0 filled
    s.reserve('char', 'y');
    expect(s.readyToShip()).toBe(true);           // reserved slot is in the newest row, not row 0
    const t = new Shelf();
    t.reserve('char', 'a'); t.newline(); t.newline(); t.newline();
    expect(t.readyToShip()).toBe(false);          // row 0 still in flight
  });
});
```

(Add `Shelf` to the test's imports if it is missing.)

`shelf/view.ts`: import `SHELF_COLS` and export the width maths. `get width()` returns `shelfWidth(this.size, this.shelf.cols)`:

```ts
/** Plank length for a product slot size (MARGIN both ends + one pitch per column). */
export const shelfWidth = (size: Vec3, cols = SHELF_COLS): number => MARGIN * 2 + cols * (size[0] + GAP_X);
```

- [ ] **Step 11: Director: active-only tick, pending backspace, `shipRow`, plain Enter.** In `engine/director.ts`:

```ts
  private pending = new Map<ProductKind, number>();

  constructor(private o: DirectorOptions) {
    // a backspace that met a busy row waits for the next removal (shelf/model.ts peekLast ruling)
    this.events.on('slot:removed', ({ kind }) => {
      const n = this.pending.get(kind) ?? 0;
      if (n <= 0) return;
      this.pending.set(kind, n - 1);
      this.backspaceCmd(kind);
    });
  }

  handle(cmd: Command): void {
    const kind = this.o.settings().product;
    if (cmd.type !== 'backspace') this.pending.delete(kind); // typing cancels waiting backspaces
    // ... switch unchanged
  }

  /** Advance the active factory only (others are paused); returns true while it has anything in flight. */
  update(simDt: number): boolean {
    const kind = this.o.settings().product;
    const host = this.hosts.get(kind);
    const mine = () => [...this.placing.values()].filter((p) => p.kind === kind);
    if (host) {
      // a job arcing to the shelf is still in flight (cinematic shows one product all the way to the shelf)
      host.line.maxInFlight = paceParams(this.o.settings().pace).maxInFlight - mine().length;
      host.line.tick(simDt);
    }
    for (const p of mine()) {
      // ... the existing placement-arc body, unchanged
    }
    return (host?.line.jobs.length ?? 0) > 0 || mine().length > 0;
  }

  /** Forklift lift: remove the oldest row from the model and announce it (fx/site.ts calls this). */
  shipRow(kind: ProductKind): Slot[] | null {
    const slots = this.shelf(kind).shipRow();
    if (slots) this.events.emit('row:shipped', { kind, slots });
    return slots;
  }

  private enter(kind: ProductKind): void {
    const shelf = this.shelf(kind);
    shelf.newline();
    this.events.emit('row:new', { kind, row: shelf.rows.length - 1 });
  }

  private backspaceCmd(kind: ProductKind): void {
    const shelf = this.shelf(kind);
    const target = shelf.peekLast();
    if (!target) return;
    if (target.kind === 'busy') { this.pending.set(kind, (this.pending.get(kind) ?? 0) + 1); return; }
    // ... rest unchanged
  }
```

`engine/director.test.ts`:
- Replace the test `'enter starts a new row; with forklift it ships the closed row'` with the first test below.
- Rename `'update applies maxInFlight to every attached line'` to `'update applies maxInFlight to the active line'`. Its body is unchanged; `letter` is the default product.
- Add the other two tests:

```ts
  it('enter is a plain newline; shipRow ships the oldest closed row', () => {
    const { d, typeStr } = setup();
    const rows: number[] = [];
    d.events.on('row:new', ({ row }) => rows.push(row));
    typeStr('ab');
    d.handle({ type: 'enter' });
    typeStr('c');
    expect(d.shelf('bottle').text()).toBe('ab\nc');
    expect(rows).toEqual([1]);
    const shipped: string[] = [];
    d.events.on('row:shipped', ({ slots }) => shipped.push(slots.map((s) => s.char).join('')));
    expect(d.shipRow('bottle')?.map((s) => s.char).join('')).toBe('ab');
    expect(shipped).toEqual(['ab']);
    expect(d.shelf('bottle').text()).toBe('c');
  });

  it('only the active factory runs', () => {
    const { lines, settings, typeStr, run } = setup();
    typeStr('a');
    run(0.5);
    const a = lines.bottle.jobs[0];
    const snap = () => JSON.stringify([a.phase, a.stationIndex, a.progress, a.pos]);
    const before = snap();
    settings.product = 'can';
    run(2);
    expect(snap()).toBe(before);
    settings.product = 'bottle';
    run(0.3);
    expect(snap()).not.toBe(before);
  });

  it('a busy backspace retries after the next slot removal; typing cancels it', () => {
    const { d, typeStr } = setup();
    const seen: string[] = [];
    const dying: number[] = [];
    d.setBackspaceHandler({
      handleBackspace(t, { kind }) {
        seen.push(t.kind);
        if (t.kind === 'newline') { d.shelf(kind).removeNewline(); return; }
        d.shelf(kind).markDying(t.id); // like a shot in progress
        dying.push(t.id);
      },
    });
    const remove = (id: number) => { d.shelf('bottle').remove(id); d.events.emit('slot:removed', { kind: 'bottle', slotId: id }); };
    typeStr('ab');
    d.handle({ type: 'enter' });
    typeStr('c');
    d.handle({ type: 'backspace' }); // c → dying
    d.handle({ type: 'backspace' }); // busy: the new row holds only the dying c
    expect(seen).toEqual(['char']);
    remove(dying[0]);
    expect(seen).toEqual(['char', 'newline']);
    expect(d.shelf('bottle').text()).toBe('ab');

    d.handle({ type: 'enter' });
    typeStr('x');
    d.handle({ type: 'backspace' }); // x → dying
    d.handle({ type: 'backspace' }); // busy
    typeStr('y');                    // cancels the waiting backspace
    remove(dying[1]);
    expect(seen).toEqual(['char', 'newline', 'char']);
  });
```

- [ ] **Step 12: Shatter style on the product contract.** In `engine/product.ts`:

```ts
import type { SoundName } from '../audio/types';
import type { MaterialRole } from './looks';
import type { ParticleKind } from './particles';

/** How a shot product breaks (spec "Shatter"); also the debris pile in debris mode. */
export interface ShatterStyle {
  burst: { kind: ParticleKind; count: number }[];
  sounds: SoundName[];
  fragments: { role: MaterialRole; count: number; size: number };
  puddle?: boolean;
}
// in ProductModel, after lineSize:
  shatter: ShatterStyle;
```

`factories/letter/product.ts`, in the `letterProduct` model object:

```ts
  shatter: {
    burst: [{ kind: 'spark', count: 36 }, { kind: 'smoke', count: 6 }],
    sounds: ['metal-crumple'],
    fragments: { role: 'steel', count: 9, size: 3.2 },
  },
```

Find every other `ProductModel` literal with `grep -rn "lineSize:" --include='*.ts' --include='*.tsx' .`, excluding `node_modules`. That covers `engine/factoryHost.test.ts` and anything in `components/Bench.tsx` or other tests. Add `shatter: { burst: [], sounds: [], fragments: { role: 'steel', count: 0, size: 1 } },` to each.

Add to `factories/letter/product.test.ts`:

```ts
it('declares a metal shatter style', () => {
  expect(letterProduct.shatter.sounds).toContain('metal-crumple');
  expect(letterProduct.shatter.fragments.count).toBeGreaterThan(0);
});
```

(Import `letterProduct` if the test file does not already.)

- [ ] **Step 13: Registry on the campus.** `engine/factoryHost.ts`: change `const FLOOR_PAD = 70;` to `export const FLOOR_PAD = 70;`, and nothing else in this task. `factories/registry.ts`:

```ts
import { campusLayout, PAD_LEFT, PAD_RIGHT, SITE_SIZE, type Plot } from '../engine/campus';
import type { FactoryDef } from '../engine/factory';
import { layoutStations } from '../engine/layout';
import { LAYOUT_MODES, PRODUCT_KINDS, type ProductKind, type Vec3 } from '../engine/types';
import { shelfWidth } from '../shelf/view';
import { letterFactory } from './letter';
import { BELT_TOP } from './shared/dims';

/** ProductKind → FactoryDef (built factories only; the rest are construction sites). */
export const FACTORIES: Partial<Record<ProductKind, FactoryDef>> = { letter: letterFactory };

/** Plot width: the widest the factory gets in any layout mode (or its shelf), plus the left pad and the dock pad. */
export function plotWidth(def: FactoryDef): number {
  let w = shelfWidth(def.product.size);
  for (const m of LAYOUT_MODES) {
    const b = layoutStations(def.stations, m, [0, 0, BELT_TOP]).bounds;
    w = Math.max(w, b.max[0] - b.min[0]);
  }
  return PAD_LEFT + w + PAD_RIGHT;
}

/** The campus: one plot per kind along +x in PRODUCT_KINDS order. */
export const PLOTS: readonly Plot[] = campusLayout(PRODUCT_KINDS.map((kind) => {
  const def = FACTORIES[kind];
  return { kind, width: def ? plotWidth(def) : SITE_SIZE[0], built: !!def };
}));

export const plotOf = (kind: ProductKind): Plot => PLOTS.find((p) => p.kind === kind)!;

/** World origin of a factory (its layout origin) on the campus. */
export const factoryOrigin = (kind: ProductKind): Vec3 => plotOf(kind).origin;
```

Delete `FACTORY_SPACING`. Grep for it; `components/Scene.tsx` uses only `factoryOrigin`. Create `factories/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PAD_RIGHT, ROAD } from '../engine/campus';
import { FLOOR_PAD } from '../engine/factoryHost';
import { layoutStations } from '../engine/layout';
import { LAYOUT_MODES, PRODUCT_KINDS } from '../engine/types';
import { shelfWidth } from '../shelf/view';
import { FACTORIES, PLOTS, factoryOrigin, plotOf } from './registry';
import { BELT_TOP } from './shared/dims';

describe('campus plots', () => {
  it('one plot per kind, in order, ROAD apart', () => {
    expect(PLOTS.map((p) => p.kind)).toEqual(PRODUCT_KINDS);
    for (let i = 1; i < PLOTS.length; i++) expect(PLOTS[i].x0 - PLOTS[i - 1].x1).toBe(ROAD);
    expect(plotOf('letter').built).toBe(true);
    expect(plotOf('car').built).toBe(!!FACTORIES.car);
  });
  it('every layout of a built factory (floor pad, shelf, dock pad) fits inside its plot', () => {
    for (const p of PLOTS.filter((q) => q.built)) {
      const def = FACTORIES[p.kind]!;
      const o = factoryOrigin(p.kind);
      for (const m of LAYOUT_MODES) {
        const b = layoutStations(def.stations, m, [o[0], o[1], BELT_TOP]).bounds;
        expect(b.min[0] - FLOOR_PAD, m).toBeGreaterThanOrEqual(p.x0);
        expect(Math.max(b.max[0], b.min[0] + shelfWidth(def.product.size)) + PAD_RIGHT, m).toBeLessThanOrEqual(p.x1);
      }
    }
  });
});
```

- [ ] **Step 14: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`. All pass. `pnpm dev` still shows the letter factory as before, at a new x origin. Commit:

```bash
git add -A
git commit -m "feat(engine): campus plots, backspace plan, sky, patrol, active-only director

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Campus scene: buildings, construction sites, ground, camera flight, product picker

**Files:**
- Create:
  - `factories/shared/building.ts`, `factories/shared/building.test.ts`
  - `fx/ground.ts`, `fx/ground.test.ts`
  - `fx/construction.ts`, `fx/construction.test.ts`
  - `fx/site.ts`, `fx/site.test.ts`
  - `fx/testkit.ts`
- Modify:
  - `engine/factoryHost.ts` (+test): dock pad, `floorBox()`
  - `engine/camera.ts` (+test): `fly`, `flying`, `shake`
  - `components/Scene.tsx`, `hud/Hud.tsx`

**Interfaces:**
- Consumes (from Task 13): `PLOTS`, `plotOf`, `PAD_RIGHT`, `SITE_SIZE`, `SITE_Y0`, `FLIGHT_MS`, `flightPose`, `Pose`.
- Produces:
  - `FactoryHost.floorBox(): Box2` where `Box2 = { x0: number; x1: number; y0: number; y1: number }` (export `Box2` from `factoryHost.ts`)
  - `buildBuilding(looks, box: Box2, height: number): Building`
  - `Building { group; height; chuteTop: Vec3; chuteBottom: Vec3; binPos: Vec3; dockDoor: Vec3; dockPark: Vec3; signAt: Vec3; setNight(on: boolean): void; dispose(): void }`
  - `buildGround(looks, plots: readonly Plot[]): { group: THREE.Group; dispose(): void }`
  - `class ConstructionSite { constructor(looks, plot: Plot); group; bounds(): { min: Vec3; max: Vec3 }; update(realDt: number): void; setNight(on: boolean): void; dispose(): void }`
  - `class FactorySite { constructor(host: FactoryHost, d: SiteDeps, parent: THREE.Object3D); group; building: Building; rebuild(): void; update(realDt: number, night: number): void; restyle(): void; dispose(): void }`
  - `SiteDeps = { looks: Looks; director: Director; audio: AudioBus; particles: ParticleSystem; settings: () => Settings }`
  - `CameraRig.fly(from: { min: Vec3; max: Vec3 }, now: number)`, `CameraRig.flying`, `CameraRig.shake(mag: number)`
  - `fx/testkit.ts`: `miniFactory()`, `fakeAudio()`, `mesh(root)` (see Step 1)

**Builder rules (every builder in `fx/` and `factories/shared/`):**
- **Meshes:** only from `looks.part` or the parts kit (`housing`, `box`, `column`, `beam`, `pipe`, `lathe`, `flange`, `lamp`, `panel`, `hazardBand`, `railing`, `legs`). Every mesh therefore carries `userData.role`.
- **Coordinates:** world coordinates, z-up, floor top at z = 0. Builders return groups placed at the world origin, with children positioned in world coordinates.
- **Dispose:** `dispose()` disposes every geometry it created and removes the group from its parent.
- **Animation:** no per-frame allocation in `update`.

- [ ] **Step 1: Test kit** `fx/testkit.ts`. It is imported by tests only. It reuses the shape of `engine/factoryHost.test.ts`'s fixture:

```ts
import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import { Director } from '../engine/director';
import type { FactoryDef } from '../engine/factory';
import { FactoryHost } from '../engine/factoryHost';
import { Looks } from '../engine/looks';
import { ParticleSystem } from '../engine/particles';
import type { ProductHandle, ProductModel } from '../engine/product';
import { defaultSettings, type Settings } from '../engine/settings';
import type { StationDef } from '../engine/station';

export interface TestHandle extends ProductHandle { disposed: boolean }

export function fakeAudio() {
  const plays: string[] = [];
  const audio = { play: (n: string) => { plays.push(n); }, loop: () => ({ setGain() {}, stop() {} }) } as unknown as AudioBus;
  return { audio, plays };
}

export const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};

/** A two-station 'letter' factory with recording handles, mounted on a real Director + FactoryHost (layout 'pan'). */
export function miniFactory(over: Partial<Settings> = {}) {
  const settings: Settings = { ...defaultSettings, product: 'letter', layout: 'pan', ...over };
  const { audio, plays } = fakeAudio();
  const director = new Director({ settings: () => settings, now: () => 0, audio });
  const handles: TestHandle[] = [];
  const product: ProductModel = {
    kind: 'letter', stages: ['raw', 'done'], size: [26, 8, 32], lineSize: 46,
    shatter: { burst: [{ kind: 'spark', count: 4 }], sounds: ['metal-crumple'], fragments: { role: 'steel', count: 3, size: 3 } },
    create: () => {
      const h: TestHandle = { root: new THREE.Group(), disposed: false, shape() {}, place() {}, restyle() {}, dispose() { h.disposed = true; } };
      h.root.add(new THREE.Mesh(new THREE.BoxGeometry(26, 8, 32)));
      handles.push(h);
      return h;
    },
  };
  const station = (id: string): StationDef => ({
    id, label: id, footprint: [90, 90], height: 60, duration: 0.3, outputStage: 'done',
    create: () => ({ begin() {}, update() {}, finish: () => 'pass', destroy() {} }),
  });
  const def: FactoryDef = { kind: 'letter', label: 'L', product, stations: [station('s1'), station('s2')] };
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const parent = new THREE.Group();
  const particles = new ParticleSystem();
  const host = new FactoryHost(def, [0, 0, 0], { parent, looks, director, particles, audio, settings: () => settings, now: () => 0 }, 'pan');
  const type = (s: string) => { for (const ch of s) director.handle(ch === ' ' ? { type: 'space' } : ch === '\n' ? { type: 'enter' } : { type: 'char', char: ch }); };
  return { settings, director, host, handles, looks, parent, particles, audio, plays, def, type };
}
```

- [ ] **Step 2: Host dock pad + `floorBox`.** In `engine/factoryHost.ts`:
- `import { PAD_RIGHT } from './campus';`
- Add `export interface Box2 { x0: number; x1: number; y0: number; y1: number }` and a field `private box: Box2 = { x0: 0, x1: 0, y0: 0, y1: 0 };`.
- In `build()`, compute `x1 = Math.max(b.max[0], s.max[0]) + PAD_RIGHT` (the dock side), keep the others at `FLOOR_PAD`, and store `this.box = { x0, x1, y0, y1 }`.
- Add `floorBox(): Box2 { return { ...this.box }; }`.

Test in `engine/factoryHost.test.ts`:

```ts
it('floorBox pads the layout + shelf by FLOOR_PAD, and the +x side by the dock pad', () => {
  const { host } = setup();
  const f = host.floorBox();
  const b = host.bounds();
  expect(f.x0).toBe(b.min[0] - FLOOR_PAD);
  expect(f.x1).toBe(b.max[0] + PAD_RIGHT);
  expect(f.y0).toBe(b.min[1] - FLOOR_PAD);
  expect(f.y1).toBe(b.max[1] + FLOOR_PAD);
});
```

(Import `FLOOR_PAD` from `./factoryHost` and `PAD_RIGHT` from `./campus`.)

- [ ] **Step 3: Building shell.** Failing test first, `factories/shared/building.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { meshes } from '../../fx/testkit';
import { buildBuilding } from './building';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const box = { x0: -100, x1: 900, y0: -600, y1: 150 };

describe('buildBuilding', () => {
  const b = buildBuilding(looks, box, 320);
  it('every mesh is role-tagged and cut-tagged', () => {
    const ms = meshes(b.group);
    expect(ms.length).toBeGreaterThan(30);
    for (const m of ms) { expect(m.userData.role).toBeTruthy(); expect(m.userData.cut).toBe(true); }
  });
  it('stays within the floor box (dock apron may stick out 80 on +x), back wall reaches full height', () => {
    const bb = new THREE.Box3().setFromObject(b.group);
    expect(bb.min.x).toBeGreaterThanOrEqual(box.x0 - 1);
    expect(bb.max.x).toBeLessThanOrEqual(box.x1 + 80);
    expect(bb.min.y).toBeGreaterThanOrEqual(box.y0 - 1);
    expect(bb.max.y).toBeLessThanOrEqual(box.y1 + 1);
    expect(bb.max.z).toBeGreaterThanOrEqual(320);
    expect(b.height).toBe(320);
  });
  it('front of the building stays low (open dollhouse front)', () => {
    const front = meshes(b.group).filter((m) => new THREE.Box3().setFromObject(m).max.y < box.y0 + 40);
    for (const m of front) {
      const bb = new THREE.Box3().setFromObject(m);
      const isDockFrame = bb.min.x > box.x1 - 200; // dock door frame on the +x front corner
      if (!isDockFrame) expect(bb.max.z).toBeLessThanOrEqual(30);
    }
  });
  it('anchors sit inside the building: chute on the back wall above the bin, dock on +x near the front', () => {
    expect(b.chuteTop[1]).toBeGreaterThan(box.y1 - 70);
    expect(b.chuteTop[2]).toBeGreaterThan(b.chuteBottom[2]);
    expect(b.binPos[2]).toBe(0);
    expect(b.dockDoor[0]).toBeCloseTo(box.x1, 0);
    expect(b.dockDoor[1]).toBeLessThan(box.y0 + 200);
    expect(b.dockPark[0]).toBeLessThan(box.x1);
  });
  it('night swaps window glass for glow', () => {
    const glow = () => meshes(b.group).filter((m) => m.userData.role === 'glow' && m.visible).length;
    b.setNight(false);
    const day = glow();
    b.setNight(true);
    expect(glow()).toBeGreaterThan(day);
  });
  it('dispose detaches and disposes geometry', () => {
    const p = new THREE.Group();
    const c = buildBuilding(looks, box, 320);
    p.add(c.group);
    const g = meshes(c.group)[0].geometry;
    let gone = false;
    g.addEventListener('dispose', () => { gone = true; });
    c.dispose();
    expect(gone).toBe(true);
    expect(c.group.parent).toBeNull();
  });
});
```

Implement `factories/shared/building.ts` with `buildBuilding(looks, box, height)`. Wall thickness T = 8 and knee height KNEE = 24. The shell is a dollhouse cutaway with no roof. It must contain:
- **Back wall** (y from y1 − T to y1, full width x0..x1):
  - concrete plinth 0..40
  - `paint` cladding from 40 to `height`
  - a `steel` eave cap on top
  - a clerestory **window band** at z height − 90 .. height − 40: panes about 50 wide every 64, each a thin `glass` box plus a coincident slightly-proud `glow` box. Day shows glass; night hides glass and shows glow.
  - **Wall lamps**: one `lamp(looks, 4)` every 160 at z 150 on the inner face. `setNight` calls `set(on)`.
- **Side walls** (x0 and x1, thickness T, spanning y0..y1). Each is an `ExtrudeGeometry` of the sloped polygon (0,0) (d,0) (d,H) (0,KNEE), where d = y1 − y0 runs front → back. Map it with `geom.applyMatrix4(new THREE.Matrix4().makeBasis(Y, Z, X))`, where `X/Y/Z` are the world unit vectors (shape x → world y, shape y → world z, extrusion → world x), then translate. Role `paint`.
  - The **+x side wall** leaves a **dock opening** from y0 + 30 to y0 + 140. Build the wall as two pieces: a front stub over 0..30 and the sloped remainder from 140 to d.
- **Dock door frame** in that opening: two `column` posts (`steel`, r 3, height 82), a `steel` lintel beam at z 80, a `paint-accent` roll-up shutter box (housing 8 × 116 × 14) on the lintel, and a `hazardBand` threshold. Outside the door, a concrete apron 70 × 120 × 2 plus two `paint-accent` bollards.
- **Front knee wall** (y0 .. y0 + T, height KNEE), running from x0 to the dock opening.
- **Columns:** `steel` boxes 12 × 12 at the four corners, and every ≤ 160 along the back and side walls, each up to that wall's local height.
- **Sign:** a `paint` board 180 × 10 × 70 centred on the back wall top, with its bottom at height − 30 so it rises above the wall, and a `steel` frame. `signAt` = a point 14 in front of the board's face, at its bottom + 6.
- **Reject chute + bin** against the back wall at x = (x0 + x1) / 2:
  - an inclined `steel` trough (a U-section: a box base plus two box sides) from `chuteTop` = [cx − 70, y1 − 34, 150] down to `chuteBottom` = [cx + 70, y1 − 34, 58], on two `legs`
  - the bin: `paint` walls, open top, 60 × 44 × 46, with four `rubber` castor wheels, standing at `binPos` = [cx + 120, y1 − 34, 0]
- **Anchors:**
  - `dockDoor` = [x1, y0 + 85, 0]
  - `dockPark` = [x1 − 110, y0 + 85, 0], the forklift's parking spot inside
- **Tagging:** tag every mesh `userData.cut = true` at the end.
- Return `{ group, height, chuteTop, chuteBottom, binPos, dockDoor, dockPark, signAt, setNight, dispose }`.

Run the test. Expected: PASS.

- [ ] **Step 4: Ground + construction site.** Tests first. `fx/ground.test.ts`:
- builds over `PLOTS`
- every mesh role-tagged
- the bounding box covers `PLOTS[0].x0 − 300 .. PLOTS.at(-1).x1 + 300` in x
- the top of every mesh is ≤ 0 (the ground never pokes above the floor top)

`fx/construction.test.ts`, with `const plot = { kind: 'bottle', x0: 2000, x1: 2900, built: false, origin: [2110, 0, 0] }`:
- every mesh role-tagged
- `bounds()` lies within x0..x1, SITE_Y0..SITE_Y0 + SITE_SIZE[1], with z ≥ 0
- after `update(5)` the jib group's `rotation.z` changed
- `setNight(true)` shows at least one visible `glow` mesh
- `dispose()` detaches

Implement `fx/ground.ts` `buildGround(looks, plots)`:
- one `concrete` slab spanning all plots ± 300 in x and y −1000..600, top at z = −1 (housing h 2 at z −3)
- a front road along y = −760 (width 120, `rubber`, top z −0.5) across the whole slab, with `paint-accent` lane dashes (box 30 × 3 × 0.6 every 70, top z −0.2)
- cross roads in each ROAD gap between plots, from the front road to y = 600

Implement `fx/construction.ts` `ConstructionSite` on the plot's x0..x1 × [SITE_Y0, SITE_Y0 + 700]. It needs:
- a `concrete` slab inset 40, top z = 0
- a 4 × 6 grid of `copper` rebar stubs (thin columns h 30)
- a perimeter fence: `steel` posts every 60 (h 50) with two `steel` rails, and a 90 gap as the gate at the front centre
- a **tower crane**:
  - mast: a lattice made of four corner `beam`s plus diagonal `beam`s, 24 × 24, height 380, near the back-left
  - slewing group on top: a `paint-accent` jib lattice 360 long, a counter-jib 120 long with a `concrete` counterweight block, an operator cab (`paint-accent` housing with a `glass` window), and a trolley on the jib with a `steel` cable and hook block (`paint-accent`) hanging 200
  - a red `lamp` at the jib tip (night on)
  - `update(dt)` slews the group: `rotation.z = 0.6 * Math.sin(t * 0.08)`, with t accumulated from `dt`
- a `paint-accent` site cabin (housing 120 × 60 × 50) with two `glass` windows and a matching `glow` window pair shown at night
- a stacked I-beam pile: three layers of three `steel` beams with `wood` dunnage blocks between layers
- a `hazardBand` sign board on two posts at the gate

- [ ] **Step 5: `FactorySite` (building + sign) and its test.** Failing test `fx/site.test.ts`:

```ts
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
```

Implement `fx/site.ts`:

```ts
import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Director } from '../engine/director';
import type { FactoryHost } from '../engine/factoryHost';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { ProductHandle } from '../engine/product';
import type { Settings } from '../engine/settings';
import type { Job } from '../engine/types';
import { buildBuilding, type Building } from '../factories/shared/building';

export interface SiteDeps { looks: Looks; director: Director; audio: AudioBus; particles: ParticleSystem; settings: () => Settings }

export const BUILDING_MIN_H = 320;
const SIGN_SCALE = 3;

/** Everything around one built factory's machines: building shell, sign; later hoist, broom, forklift, workers. */
export class FactorySite {
  readonly group = new THREE.Group();
  building!: Building;
  private sign: ProductHandle | null = null;

  constructor(readonly host: FactoryHost, private d: SiteDeps, parent: THREE.Object3D) {
    parent.add(this.group);
    this.build();
  }

  /** After host.relayout(): the floor box changed. */
  rebuild(): void {
    this.clear();
    this.build();
  }

  update(_realDt: number, night: number): void {
    this.building.setNight(night > 0.5); // setNight is a no-op when unchanged
  }

  restyle(): void { this.sign?.restyle(); }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private build(): void {
    const height = Math.max(BUILDING_MIN_H, this.host.layout.bounds.max[2] + 160);
    this.building = buildBuilding(this.d.looks, this.host.floorBox(), height);
    this.group.add(this.building.group);
    const def = this.host.def;
    const stage = def.product.stages[def.product.stages.length - 1];
    const job: Job = {
      id: -1, slotId: -1, char: 'A', isSpace: false, special: 'none', product: def.kind, stage, phase: 'shelved',
      stationIndex: def.stations.length - 1, progress: 1, pos: [...this.building.signAt], defect: false, retries: 0,
    };
    const h = def.product.create(job, { looks: this.d.looks, marks: this.d.settings().letterMarks });
    h.shape(stage, 1);
    h.place(1);
    h.root.scale.setScalar(SIGN_SCALE);
    h.root.position.set(...this.building.signAt);
    this.group.add(h.root);
    this.sign = h;
  }

  private clear(): void {
    if (this.sign) { this.sign.dispose(); this.sign.root.removeFromParent(); this.sign = null; }
    this.building?.dispose();
  }
}
```

Run the test. Expected: PASS.

- [ ] **Step 6: Camera flight + shake.** Failing tests in `engine/camera.test.ts`:

```ts
describe('CameraRig.fly', () => {
  const mk = (box: { min: Vec3; max: Vec3 }) => {
    const ref = { box };
    const rig = new CameraRig({ overview: () => ref.box, newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.setLook('flat');
    rig.resize(1280, 800, 1);
    rig.snap();
    return { rig, ref };
  };
  const A = { min: [0, -300, 0] as Vec3, max: [900, 0, 100] as Vec3 };
  const B = { min: [3000, -300, 0] as Vec3, max: [3900, 0, 100] as Vec3 };
  it('pulls out on A, pans, and lands exactly on the new overview', () => {
    const { rig, ref } = mk(A);
    const start = rig.center();
    ref.box = B;
    rig.fly(A, 1000);
    expect(rig.flying).toBe(true);
    rig.update(1 / 60, 1000);
    expect(rig.center().x).toBeCloseTo(start.x, 6);
    rig.update(1 / 60, 1000 + FLIGHT_MS * 0.5);
    expect(rig.center().halfWidth).toBeGreaterThan(start.halfWidth * 1.2);
    rig.update(1 / 60, 1000 + FLIGHT_MS);
    expect(rig.flying).toBe(false);
    expect(rig.center().x).toBeCloseTo(3450, 3);
    expect(rig.center().halfWidth).toBeCloseTo(start.halfWidth, 3);
  });
  it('fly twice: the second flight starts from the current pose (no jump)', () => {
    const { rig, ref } = mk(A);
    ref.box = B;
    rig.fly(A, 0);
    rig.update(1 / 60, FLIGHT_MS * 0.5);
    const mid = rig.center();
    ref.box = A;
    rig.fly(B, FLIGHT_MS * 0.5);
    rig.update(1 / 60, FLIGHT_MS * 0.5);
    expect(rig.center().x).toBeCloseTo(mid.x, 6);
    expect(rig.center().halfWidth).toBeCloseTo(mid.halfWidth, 6);
  });
  it('shake offsets the camera briefly, then settles back', () => {
    const { rig } = mk(A);
    rig.update(1 / 60, 0);
    const p0 = rig.active().position.clone();
    rig.shake(1);
    rig.update(1 / 60, 16);
    expect(rig.active().position.distanceTo(p0)).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) rig.update(1 / 60, 32 + i * 16);
    expect(rig.active().position.distanceTo(p0)).toBeLessThan(0.01);
  });
});
```

(Import `FLIGHT_MS` from `./campus`.)

Implement in `engine/camera.ts`:

```ts
import { FLIGHT_MS, flightPose, type Pose } from './campus';
// fields
  private flight: { from: Pose; box: { min: Vec3; max: Vec3 }; t0: number } | null = null;
  private shakeAmt = 0;
  private shakeOff = new THREE.Vector3();

  /** Fly from the current pose to the (already switched) overview: pull out, pan, push in. `from` = the old factory's box. */
  fly(from: { min: Vec3; max: Vec3 }, now: number): void {
    this.flight = { from: { target: [this.target.x, this.target.y, this.target.z], extent: this.extent }, box: from, t0: now };
  }

  get flying(): boolean { return this.flight !== null; }

  /** Kick the camera (shotgun recoil); decays in ~0.3 s. */
  shake(mag: number): void { this.shakeAmt = Math.max(this.shakeAmt, mag); }
```

- In `attach`'s `'start'` listener, add `this.flight = null;` (a user drag cancels the flight).
- `update(realDt, now)`: decay the shake first, with `this.shakeAmt *= Math.exp(-realDt * 12); if (this.shakeAmt < 1e-3) this.shakeAmt = 0;`. Then, before the controls branch, add:

```ts
    if (this.flight) {
      const f = this.flight;
      const g = this.goal(now);
      const ov = this.targets.overview();
      const min: Vec3 = [Math.min(f.box.min[0], ov.min[0]), Math.min(f.box.min[1], ov.min[1]), Math.min(f.box.min[2], ov.min[2])];
      const max: Vec3 = [Math.max(f.box.max[0], ov.max[0]), Math.max(f.box.max[1], ov.max[1]), Math.max(f.box.max[2], ov.max[2])];
      const wide = Math.max(1.25 * Math.max(f.from.extent, g.extent), fitView(min, max, g.dir, this.aspect, this.isOrtho()).extent);
      const u = (now - f.t0) / FLIGHT_MS;
      const p = flightPose(u, f.from, { target: g.target, extent: g.extent }, wide);
      this.target.set(...p.target);
      this.extent = p.extent;
      this.dir.set(...g.dir);
      if (u >= 1) this.flight = null;
      this.apply();
      return true;
    }
```

- `apply()`: after computing the camera position, if `this.shakeAmt > 0`, offset both the position and the look-at point by a random vector. Size: `this.shakeAmt * 0.015 * (this.isOrtho() ? this.extent : this.extent * TAN)` per axis. Reuse `this.shakeOff`, so there is no allocation. When `shakeAmt` is 0 the pose must be exactly the unshaken one.

Run the tests. Expected: PASS.

- [ ] **Step 7: Scene wiring.** Edit `components/Scene.tsx`:
- **Imports:** `PLOTS`, `plotOf` from `@/factories/registry`; `SITE_SIZE`, `SITE_Y0` from `@/engine/campus`; `buildGround` from `@/fx/ground`; `ConstructionSite` from `@/fx/construction`; `FactorySite` from `@/fx/site`.
- **After hosts:**

```ts
    const ground = buildGround(looks, PLOTS);
    world.add(ground.group);
    const sites = new Map<ProductKind, FactorySite>();
    for (const [kind, host] of hosts) sites.set(kind, new FactorySite(host, { looks, director, audio, particles, settings }, world));
    const yards = PLOTS.filter((p) => !p.built).map((p) => { const c = new ConstructionSite(looks, p); world.add(c.group); return c; });
    const boundsOf = (kind: ProductKind): { min: Vec3; max: Vec3 } => {
      const h = hosts.get(kind);
      if (h) return h.bounds();
      const p = plotOf(kind);
      return { min: [p.x0, SITE_Y0, 0], max: [p.x1, SITE_Y0 + SITE_SIZE[1], 200] };
    };
    const overview = () => boundsOf(settings().product);
```

- **Loop:** delete the `host.root.visible = ...` line. Paused factories stay visible. Update only the active host, and then its site:

```ts
        const cur = settings().product;
        hosts.get(cur)?.update(simDt, realDt);
        sites.get(cur)?.update(realDt, 0); // night wired in Task 18
        for (const y of yards) y.update(realDt);
```

- **`applyLook`:** add `for (const s of sites.values()) s.restyle();`.
- **Relayout branch:** after each `h.relayout(...)`, call `sites.get(kind)?.rebuild()`. Iterate `for (const [kind, h] of hosts)`.
- **Product change:** replace `if (s.product !== p.product) fitStage();` with:

```ts
      if (s.product !== p.product) { rig.fly(boundsOf(p.product), performance.now()); fitStage(); audio.play('whoosh'); }
```

- **Cleanup:** dispose `sites`, `yards` and `ground` before the hosts are destroyed.

- [ ] **Step 8: HUD product picker.** In `hud/Hud.tsx`, add above Look:

```tsx
import { FACTORIES } from '../factories/registry';
import { PRODUCT_KINDS, type ProductKind } from '../engine/types';

const PRODUCT_LABEL: Record<ProductKind, string> = {
  letter: 'Cast metal letter', bottle: 'Glass bottle', cookie: 'Cookie', donut: 'Donut', mug: 'Pottery mug', can: 'Can', car: 'Toy car',
};
/** Dev builds can fly to construction sites to check the campus flight; production lists them as coming soon. */
const DEV = process.env.NODE_ENV !== 'production';

      <label>Product
        <select value={s.product} onChange={(e) => { e.target.blur(); set({ product: e.target.value as ProductKind }); }}>
          {PRODUCT_KINDS.map((k) => (
            <option key={k} value={k} disabled={!FACTORIES[k] && !DEV}>{PRODUCT_LABEL[k]}{FACTORIES[k] ? '' : ' (coming soon)'}</option>
          ))}
        </select>
      </label>
```

- [ ] **Step 9: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`. Then `pnpm dev`, open `http://localhost:3000`, and check in **each of the four looks**:
- the letter factory stands inside its building, with the back wall, sloped sides, knee wall, dock and sign letter visible
- the cutaway slices the front walls away
- the ground, roads and the neighbouring construction site are visible

Pick "Glass bottle (coming soon)" (dev). The camera pulls out, pans to the construction site and pushes in, with the crane slewing. Pick the letter again to fly back. Take a screenshot of each. Commit:

```bash
git add -A
git commit -m "feat(campus): buildings, construction sites, product picker, camera flight

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Shotgun, fragments, destroyer (shelf + line shots, close-up)

**Files:**
- Create: `fx/fragments.ts` (+test), `fx/shotgun.ts` (+test), `fx/destroyer.ts` (+test)
- Modify:
  - `shelf/view.ts` (+test): `release`
  - `engine/factoryHost.ts` (+test): `release`
  - `engine/stage.ts`: flash light + `tick`
  - `components/Scene.tsx`

**Interfaces:**
- Consumes: `planBackspace` (T13), `ShatterStyle` (T13), `BackspaceHandler` (`engine/director.ts`), `CameraRig.shake` (T14), `miniFactory`/`fakeAudio` (T14).
- Produces:
  - `ShelfView.release(slotId): ProductHandle | null`
  - `FactoryHost.release(jobId): ProductHandle | null`
  - `Stage.flash(pos: Vec3)`, `Stage.tick(dt: number)`
  - `class Fragments { group; burst(role, pos, count, size, floor): void; pile(role, pos, count, size, puddle): Pile; update(dt): void; dispose(): void }` with `Pile = { group: THREE.Group; dispose(): void }`
  - `class Shotgun { group; constructor(d: ShotgunDeps); shoot(target: Vec3, floor: number, onHit: () => void): void; readonly busy: boolean; update(dt): void; dispose(): void }`
  - `ShotgunDeps = { looks; particles; audio: { play(n: SoundName, o?: { x?: number }): void }; flash(pos: Vec3): void; shake(mag: number): void }`
  - `class Destroyer implements BackspaceHandler { constructor(d: DestroyerDeps); group; handleBackspace(...); update(dt): void; dispose(): void }`
  - `DestroyerDeps = { director; looks; particles; audio; settings: () => Settings; hosts: Map<ProductKind, FactoryHost>; flash(pos: Vec3): void; shake(mag: number): void }` (Task 16 adds `sites`)

- [ ] **Step 1: Handle hand-off.** `shelf/view.ts`:

```ts
  /** Hand a shelved product to an fx (shotgun): no longer owned or damped here; the caller disposes it. */
  release(slotId: number): ProductHandle | null {
    const h = this.placed.get(slotId) ?? null;
    this.placed.delete(slotId);
    return h;
  }
```

`engine/factoryHost.ts`:

```ts
  /** Hand an in-flight job's product to an fx (hoist/shotgun) before the job is destroyed; the caller disposes it. */
  release(jobId: number): ProductHandle | null {
    const h = this.handles.get(jobId) ?? null;
    this.handles.delete(jobId);
    this.shaped.delete(jobId);
    return h;
  }
```

Tests:
- `shelf/view.test.ts`: after `adopt`, `release(id)` returns the handle. A later `update` with the slot marked `dying` does not dispose it (`disposed === false`). `release` again returns null.
- `engine/factoryHost.test.ts`: type a char and step until it is on a station. `release(job.id)` returns its handle. `director.destroyJob(job.id)` then a step leaves the handle undisposed and still parented.

- [ ] **Step 2: Fragments.** Failing test `fx/fragments.test.ts`:
- `burst('steel', [0,0,40], 9, 3, 0)` makes one `InstancedMesh` child with `userData.role === 'steel'` and `count === 9`
- after `update(0.5)` every instance's z is ≥ 0 (they land on `floor`)
- after `update(3)` `count === 0`
- a 200-chunk burst caps at the pool capacity (128) without throwing
- `pile('steel', [10,0,18], 5, 3, true)` returns a group with 5 role-tagged chunk meshes plus one `liquid` puddle; `pile.dispose()` detaches it
- `dispose()` disposes the shared geometry

Implement `fx/fragments.ts`:
- **Geometry:** one shared `IcosahedronGeometry(1, 0)` for every role.
- **Pool:** per role, lazily create `new THREE.InstancedMesh(geo, looks.material(role), 128)` with `userData.role = role`, `frustumCulled = false` and `castShadow = false`, added to `group`.
- **Per chunk:** position, velocity, spin axis and rate, age, life 2.5 s, size, floor. They are stored in typed arrays per role pool, with swap-remove on death (the same pattern as `engine/particles.ts`).
- **Burst velocity:** random outward 60–160 plus up 80–200.
- **Motion:** gravity 380 on −z; bounce 0.35 with xy friction 0.6 on the floor; scale × `size` × (age > life − 0.4 ? shrink : 1).
- **Matrices:** written with a scratch `Matrix4`/`Quaternion`/`Vector3` (no allocation per frame), then `instanceMatrix.needsUpdate = true` and `count = live`.
- **Piles:** `looks.part(geo, role)` chunks scattered within ±6 of `pos`, lying on z = pos[2], random rotation and non-uniform scale. When `puddle`, add a `liquid` disc `CylinderGeometry(9, 9, 0.6, 20)` rotated to lie flat at pos z + 0.3.

- [ ] **Step 3: Shotgun.** Failing test `fx/shotgun.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import { ParticleSystem } from '../engine/particles';
import { Shotgun } from './shotgun';
import { meshes } from './testkit';

const mk = () => {
  const plays: string[] = [];
  const flashes: number[] = [];
  const shakes: number[] = [];
  const g = new Shotgun({
    looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
    particles: new ParticleSystem(),
    audio: { play: (n) => { plays.push(n); } },
    flash: () => flashes.push(1),
    shake: (m) => shakes.push(m),
  });
  const run = (s: number) => { for (let t = 0; t < s; t += 1 / 60) g.update(1 / 60); };
  return { g, plays, flashes, shakes, run };
};

describe('Shotgun', () => {
  it('is a real gun: stock, receiver, barrel, magazine, pump, all role-tagged', () => {
    const { g } = mk();
    const ms = meshes(g.group);
    expect(ms.length).toBeGreaterThanOrEqual(8);
    expect(ms.every((m) => !!m.userData.role)).toBe(true);
    expect(ms.some((m) => m.userData.role === 'wood')).toBe(true);
    expect(ms.some((m) => m.userData.role === 'steel')).toBe(true);
  });
  it('drops in, racks, fires once, hits once; idles away after 1.5 s', () => {
    const { g, plays, flashes, shakes, run } = mk();
    expect(g.group.visible).toBe(false);
    let hits = 0;
    g.shoot([100, -300, 30], 0, () => hits++);
    expect(g.busy).toBe(true);
    run(0.3);
    expect(g.group.visible).toBe(true);
    expect(hits).toBe(0);
    run(0.6);
    expect(hits).toBe(1);
    expect(plays.filter((p) => p === 'shotgun-rack')).toHaveLength(1);
    expect(plays.filter((p) => p === 'shotgun-blast')).toHaveLength(1);
    expect(flashes).toHaveLength(1);
    expect(shakes.length).toBe(1);
    run(2.5);
    expect(g.busy).toBe(false);
    expect(g.group.visible).toBe(false);
  });
  it('queues rapid shots in order without leaving', () => {
    const { g, run } = mk();
    const order: number[] = [];
    for (let i = 0; i < 3; i++) g.shoot([100 + i * 30, -300, 30], 0, () => order.push(i));
    run(3);
    expect(order).toEqual([0, 1, 2]);
  });
});
```

Implement `fx/shotgun.ts`.

Constants (real seconds): `DROP = 0.35`, `MOVE = 0.25`, `RACK = 0.25`, `TRAVEL = 0.05` (fire → hit), `RECOVER = 0.2`, `IDLE = 1.5`, `LIFT = 0.4`. Offset from the target: `OFFSET: Vec3 = [-60, -35, 45]`, the gun's position relative to the point it aims at (keeps it off the camera's +x side).

States: `'away' | 'drop' | 'move' | 'rack' | 'travel' | 'recover' | 'idle' | 'lift'`.
- **`shoot`** pushes `{ target, floor, onHit }` onto a queue.
  - From `away`, it enters `drop` at position target + OFFSET + [0, 0, 600] and eases down to target + OFFSET.
  - From `idle`, it enters `move` (eases to the next target's aim pose).
- **`rack`:** the pump slides back 5 over the first half and forward over the second. `shotgun-rack` plays at the start.
- **Fire, entering `travel`:**
  - `shotgun-blast` with `{ x: muzzle x }`
  - `flash(muzzle)` and `shake(0.6)`
  - particles: `flash` ×1 (size 10) and `spark` ×14, with velocity 300 along the aim
  - recoil: the gun moves back 4 along −aim
  - shell eject: the hull (`paint-accent`, column r 1.1 h 3.5) and its `copper` head are thrown sideways and up with gravity 380, bounce 0.3 on `floor`, spin, and are removed 3 s later. Several can be alive at once.
- **After `TRAVEL`:** `onHit()` runs once.
- **`recover`** eases the recoil back. Then the next queued shot goes to `move`, or with an empty queue, `idle`.
- **`idle`** for 1.5 s leads to `lift`, which eases up 600 and ends in `away`, `visible = false`.
- `busy` = state !== 'away'.

Aim: `group.lookAt`-style orientation built from the vector gun → target (yaw with `atan2`, pitch with `asin`), applied to a `gimbal` child so the rod stays vertical.

Model (local +x = barrel), each part built with the parts kit and rotated to lie along x:
- `wood` stock (an `ExtrudeGeometry` of a stock profile, about 18 long, 6 tall at the butt, tapering to 3.5)
- `steel` receiver box 12 × 4.2 × 6
- `steel` barrel (r 1.25, 26 long) with a bead sight
- `steel` magazine tube (r 1.0) under the barrel
- `wood` pump fore-end (r 1.9, 9 long) around the magazine tube
- `steel` trigger guard (`TorusGeometry` arc) and trigger
- `steel` hanger rod (column r 1.2, h 600) from the receiver top up out of frame

Overall about 54 long.

- [ ] **Step 4: Stage flash light.** In `engine/stage.ts`, add to `Stage`: `flash(pos: Vec3): void` and `tick(dt: number): void`. Create one `THREE.PointLight(0xffd9a0, 0, 500, 2)` in `createStage`, added to the scene once. It always exists, with intensity 0 at rest, so the light count never changes and no shaders recompile.
- `flash(pos)` moves it and sets `t = 0.12`.
- `tick(dt)` sets `intensity = PEAK * max(0, t) / 0.12`, with `PEAK = 60000` (tune visually so the gun and the nearby shelf light up for a frame).
- `dispose` removes the light.

- [ ] **Step 5: Destroyer.** Failing test `fx/destroyer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ProductKind } from '../engine/types';
import { Destroyer } from './destroyer';
import { miniFactory } from './testkit';

function setup(over = {}) {
  const f = miniFactory(over);
  const flashes: number[] = [];
  const d = new Destroyer({
    director: f.director, looks: f.looks, particles: f.particles, audio: f.audio, settings: () => f.settings,
    hosts: new Map<ProductKind, typeof f.host>([['letter', f.host]]), flash: () => flashes.push(1), shake: () => {},
  });
  f.director.setBackspaceHandler(d);
  f.parent.add(d.group);
  const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) { f.director.update(1 / 30); f.host.update(1 / 30, 1 / 30); d.update(1 / 30); } };
  const shelve = () => { for (let i = 0; i < 600 && f.director.jobsOf('letter').length; i++) step(1 / 30); };
  const bs = () => f.director.handle({ type: 'backspace' });
  return { ...f, d, step, shelve, bs, flashes };
}

describe('Destroyer', () => {
  it('shoots a shelved char: slot dies at once, then (close-up) is removed and the product shatters', () => {
    const t = setup();
    t.type('a');
    t.shelve();
    const h = t.handles[0];
    t.bs();
    expect(t.director.shelf('letter').text()).toBe('');
    expect(t.director.shelf('letter').rows[0][0].state).toBe('dying');
    t.step(2);
    expect(t.director.shelf('letter').rows[0]).toHaveLength(0);
    expect(h.disposed).toBe(true);
    expect(t.plays).toEqual(expect.arrayContaining(['shotgun-rack', 'shotgun-blast', 'metal-crumple']));
    expect(t.flashes).toHaveLength(1);
  });
  it('shoot mode: an in-flight char is removed at once and shot where it is', () => {
    const t = setup({ inflightBackspace: 'shoot' });
    t.type('a');
    t.step(0.2);
    const h = t.handles[0];
    t.bs();
    expect(t.director.shelf('letter').rows[0]).toHaveLength(0);
    expect(t.director.jobsOf('letter')).toHaveLength(0);
    expect(h.disposed).toBe(false);
    t.step(2);
    expect(h.disposed).toBe(true);
    expect(t.plays).toContain('shotgun-blast');
  });
  it('a queued (never seen) job goes quietly', () => {
    const t = setup({ pace: 'cinematic' });
    t.type('ab');
    t.bs();
    t.step(2);
    expect(t.director.shelf('letter').text()).toBe('a');
    expect(t.plays).not.toContain('shotgun-blast');
  });
  it('rapid backspaces over shelved abcde: five shots, each slot removed once', () => {
    const t = setup();
    t.type('abcde');
    t.shelve();
    const removed: number[] = [];
    t.director.events.on('slot:removed', ({ slotId }) => removed.push(slotId));
    for (let i = 0; i < 5; i++) t.bs();
    t.step(8);
    expect(t.director.shelf('letter').text()).toBe('');
    expect(new Set(removed).size).toBe(5);
    expect(removed).toHaveLength(5);
    expect(t.plays.filter((p) => p === 'shotgun-blast')).toHaveLength(5);
  });
  it('newline is removed with no fx', () => {
    const t = setup();
    t.type('a\n');
    t.bs();
    expect(t.director.shelf('letter').rows).toHaveLength(1);
  });
});
```

Implement `fx/destroyer.ts`:

```ts
import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import { planBackspace } from '../engine/backspace';
import type { BackspaceHandler, Director } from '../engine/director';
import type { FactoryHost } from '../engine/factoryHost';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { ProductHandle } from '../engine/product';
import type { Settings } from '../engine/settings';
import type { ProductKind, Vec3 } from '../engine/types';
import type { NewlineMarker, Slot } from '../shelf/model';
import { BELT_TOP } from '../factories/shared/dims';
import { Fragments } from './fragments';
import { Shotgun } from './shotgun';

export interface DestroyerDeps {
  director: Director; looks: Looks; particles: ParticleSystem; audio: AudioBus; settings: () => Settings;
  hosts: Map<ProductKind, FactoryHost>;
  flash(pos: Vec3): void;
  shake(mag: number): void;
}

/** The director's BackspaceHandler: runs the spec's decision table with the shared shotgun and fragment pool. */
export class Destroyer implements BackspaceHandler {
  readonly group = new THREE.Group();
  private gun: Shotgun;
  private frags: Fragments;

  constructor(private d: DestroyerDeps) {
    this.gun = new Shotgun({ looks: d.looks, particles: d.particles, audio: d.audio, flash: d.flash, shake: d.shake });
    this.frags = new Fragments(d.looks);
    this.group.add(this.gun.group, this.frags.group);
  }

  handleBackspace(target: Slot | NewlineMarker, { kind, director }: { kind: ProductKind; director: Director }): void {
    const host = this.d.hosts.get(kind);
    const shelf = director.shelf(kind);
    const job = target.kind === 'newline' ? null : director.jobsOf(kind).find((j) => j.id === target.jobId) ?? null;
    const plan = planBackspace(target, job, this.d.settings().inflightBackspace);
    switch (plan.type) {
      case 'newline':
        shelf.removeNewline();
        return;
      case 'quiet':
        if (plan.slot.jobId !== null) director.destroyJob(plan.slot.jobId);
        this.removeSlot(kind, plan.slot.id);
        return;
      case 'gap': // ponytail: Task 16 sends the broom; until then the gap just closes
        this.removeSlot(kind, plan.slot.id);
        this.d.audio.play('whoosh');
        return;
      case 'reject': // ponytail: Task 16 adds the hoist; until then rejects are shot
      case 'shoot-line': {
        const h = host?.release(plan.jobId) ?? null;
        const floor = (job?.pos[2] ?? BELT_TOP) - BELT_TOP;
        director.destroyJob(plan.jobId);
        this.removeSlot(kind, plan.slot.id);
        if (h) this.shoot(kind, h, floor, () => {});
        return;
      }
      case 'shoot-shelf': {
        const h = host?.shelfView.release(plan.slot.id) ?? null;
        shelf.markDying(plan.slot.id);
        if (!h) { this.removeSlot(kind, plan.slot.id); return; }
        this.shoot(kind, h, 0, () => this.removeSlot(kind, plan.slot.id));
        return;
      }
    }
  }

  update(dt: number): void {
    this.gun.update(dt);
    this.frags.update(dt);
  }

  dispose(): void {
    this.gun.dispose();
    this.frags.dispose();
    this.group.removeFromParent();
  }

  private removeSlot(kind: ProductKind, slotId: number): void {
    this.d.director.shelf(kind).remove(slotId);
    this.d.director.events.emit('slot:removed', { kind, slotId });
  }

  /** Hold the product where it is, shoot it, shatter it per its product style, then `after()`. */
  private shoot(kind: ProductKind, h: ProductHandle, floor: number, after: () => void): void {
    this.group.attach(h.root);
    const model = this.d.hosts.get(kind)!.def.product;
    const p = h.root.position;
    const at: Vec3 = [p.x, p.y, p.z + model.size[2] / 2];
    this.gun.shoot(at, floor, () => {
      const st = model.shatter;
      for (const b of st.burst) this.d.particles.emit(b.kind, { pos: at, count: b.count, spread: 6, floor });
      for (const s of st.sounds) this.d.audio.play(s, { x: at[0] });
      this.frags.burst(st.fragments.role, at, st.fragments.count, st.fragments.size, floor);
      h.dispose();
      h.root.removeFromParent();
      after();
    });
  }
}
```

Run the tests. Expected: PASS. `removeSlot` emits `slot:removed`, so a pending busy backspace in the director re-enters `handleBackspace`. That is intended.

- [ ] **Step 6: Scene wiring.**

```ts
    const destroyer = new Destroyer({
      director, looks, particles, audio, settings, hosts,
      flash: (p) => stage.flash(p), shake: (m) => rig.shake(m),
    });
    world.add(destroyer.group);
    director.setBackspaceHandler(destroyer);
```

- In the loop, after the host updates: `destroyer.update(realDt); stage.tick(realDt);`.
- Cleanup: `director.setBackspaceHandler(null); destroyer.dispose();`.

- [ ] **Step 7: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`. Then `pnpm dev` and check in every look:
- type `HELLO`, wait for it to shelve, press Backspace twice: the gun drops in, racks, flashes, the camera kicks, and the O then the L burst into steel chunks and sparks
- set the HUD in-flight option to shoot (in Task 16; for now edit the default locally to test, then revert) and press Backspace while a letter rides the belt

Take a screenshot mid-shot. Commit:

```bash
git add -A
git commit -m "feat(fx): shotgun backspace with per-product shatter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Reject hoist + chute bin, debris mode + broom, gap; HUD backspace options

**Files:**
- Create: `fx/hoist.ts` (+test), `fx/broom.ts` (+test)
- Modify: `fx/site.ts` (+test), `fx/destroyer.ts` (+test), `components/Scene.tsx`, `hud/Hud.tsx`

**Interfaces:**
- Consumes: `Building.chuteTop/chuteBottom/binPos` (T14), `ShelfView.span()`, `ShelfView.slotPos()`, `Fragments.pile` (T15).
- Produces:
  - `class Hoist { group; constructor(looks: Looks, audio: AudioBus, anchors: HoistAnchors); setAnchors(a: HoistAnchors): void; reject(h: ProductHandle, onDone?: () => void): void; readonly busy: boolean; update(dt): void; dispose(): void }` with `HoistAnchors = { chuteTop: Vec3; chuteBottom: Vec3; binPos: Vec3; ceil: number }`
  - `class Broom { group; constructor(looks, audio, particles, park: () => Vec3); sweep(at: () => Vec3 | null, kind: 'debris' | 'gap', onSwept: () => void): void; readonly busy: boolean; update(dt): void; dispose(): void }`
  - `FactorySite.hoist`, `FactorySite.broom`
  - `DestroyerDeps.sites: Map<ProductKind, FactorySite>`

- [ ] **Step 1: Hoist.** Failing test `fx/hoist.test.ts`:
- `reject(h)` reparents `h.root` under the hoist group's bin pile within 3 s, `onDone` called once, `h.disposed` false
- `'reject-kick'` played once
- seven rejects (each run to completion) leave six handles in the bin; the first is disposed
- two `reject` calls in a row are served in order
- every hoist mesh is role-tagged
- `setAnchors` mid-trip still completes

Implement `fx/hoist.ts`, a reject claw on a cable that runs up out of frame:
- **Parts:**
  - a `paint-accent` hoist block (housing 16 × 16 × 14)
  - a `steel` cable (unit-height column, scaled in z each frame from the block top to `ceil + 800`)
  - a `steel` hook body
  - three `steel` claw fingers on hinge groups, opening 35° and closing to 0°
  - a small `lamp` that blinks while moving
- **Sequence** (real seconds; positions eased with smoothstep; `home` = chuteTop + [0, 0, 160]):
  1. travel 0.5 to product top + [0, 0, 120] at z = max(that, 200)
  2. lower 0.3 to product top + [0, 0, 4]
  3. grip 0.1 (fingers close, `reject-kick`)
  4. lift 0.3 back to travel z
  5. travel 0.6 to above chuteTop
  6. release: fingers open and the product falls (gravity 380) to chuteTop z, then slides chuteTop → chuteBottom in 0.6 s with a slight spin, then drops into the bin at `binPos` + a random offset inside the bin (z 6..20, random tilt)
  7. return home

  `onDone` runs when the product lands in the bin.
- **While gripped:** `h.root.position` follows the claw tip every frame.
- **Bin pile:** a `group` holding up to 6 landed handles; the oldest is disposed and removed when a seventh arrives.
- `dispose` disposes all bin handles and any carried handle.

- [ ] **Step 2: Broom.** Failing test `fx/broom.test.ts`:
- with `park = () => [500, -400, 18]`, `sweep(() => [300, -400, 18], 'debris', cb)` calls `cb` once after travel (200 at 120/s ≈ 1.7 s) + 0.8 s, and `'broom-sweep'` played
- `'gap'` takes 0.3 s at the slot and plays `'whoosh'`
- two sweeps run in order
- an `at()` returning null mid-trip still calls `onSwept` once (the slot vanished) and returns home
- after both the broom is parked (`busy` false, position ≈ park)

Implement `fx/broom.ts`, a shelf cleaning rover:
- **Parts:**
  - a `paint-accent` body (housing 18 × 12 × 7, r 2)
  - a `paint` top cover
  - four `rubber` wheels (columns rotated along y, r 2.5)
  - a `rubber` brush roller (column r 3.2 along y, 14 wide) on two `steel` arms at the front (−x side)
  - a `lamp` beacon on top (on while moving)
- **Trip:** drives from `park()` → (park.x, at.y) → (at.x + 14, at.y) at 120/s, facing travel. Sweeps (roller spins at 25 rad/s, body jiggles ±3 in x at 6 Hz) for 0.8 s (debris) or 0.3 s (gap). Then `onSwept()` and back to park.
- **Sound:** `broom-sweep` (debris) or `whoosh` (gap) at the start of the sweep.
- **Particles:** a `smoke` puff ×4 at the slot (sweep only).
- `at()` is re-read every frame, because the slot moves when rows step back.

- [ ] **Step 3: Site owns hoist + broom.** In `fx/site.ts`:
- `hoist` and `broom` are created once in the constructor, not in `build()`, so a rebuild does not interrupt them.
- The hoist anchors come from the building: `{ chuteTop, chuteBottom, binPos, ceil: building.height }`, re-set in `rebuild()` via `hoist.setAnchors`.
- Broom park: `() => { const s = host.shelfView.span(); return [s.x1 + 20, s.y, s.z]; }`.
- `update(realDt, night)` also calls `hoist.update(realDt)` and `broom.update(realDt)`.
- `dispose` disposes both.

Extend `fx/site.test.ts`: `site.hoist` and `site.broom` exist, and still exist after `rebuild()`.

- [ ] **Step 4: Destroyer uses them.** Add `sites: Map<ProductKind, FactorySite>` to `DestroyerDeps`, and replace the two `ponytail` branches:

```ts
      case 'gap': {
        const site = this.d.sites.get(kind);
        const sv = host?.shelfView;
        if (!site || !sv) { this.removeSlot(kind, plan.slot.id); return; }
        shelf.markDying(plan.slot.id);
        site.broom.sweep(() => sv.slotPos(plan.slot.id), 'gap', () => this.removeSlot(kind, plan.slot.id));
        return;
      }
      case 'reject': {
        const h = host?.release(plan.jobId) ?? null;
        director.destroyJob(plan.jobId);
        this.removeSlot(kind, plan.slot.id);
        const site = this.d.sites.get(kind);
        if (h && site) site.hoist.reject(h);
        else if (h) { h.dispose(); h.root.removeFromParent(); }
        return;
      }
```

In `shoot-shelf`, the `after` callback becomes: close-up removes the slot; debris marks it, piles the fragments and sends the broom.

```ts
        this.shoot(kind, h, 0, () => {
          const site = this.d.sites.get(kind);
          const sv = host!.shelfView;
          if (this.d.settings().backspaceStyle !== 'debris' || !site) { this.removeSlot(kind, plan.slot.id); return; }
          shelf.markDebris(plan.slot.id);
          director.events.emit('slot:debris', { kind, slotId: plan.slot.id });
          const st = host!.def.product.shatter;
          const at = sv.slotPos(plan.slot.id) ?? [0, 0, 0];
          const pile = this.frags.pile(st.fragments.role, at, Math.max(3, Math.ceil(st.fragments.count / 2)), st.fragments.size, !!st.puddle);
          this.group.add(pile.group);
          this.piles.set(plan.slot.id, { pile, at: () => sv.slotPos(plan.slot.id) });
          site.broom.sweep(() => sv.slotPos(plan.slot.id), 'debris', () => {
            pile.dispose();
            this.piles.delete(plan.slot.id);
            this.removeSlot(kind, plan.slot.id);
          });
        });
```

`private piles = new Map<number, { pile: Pile; at: () => Vec3 | null }>();`. In `update`, each pile's group follows `at()`, so it steps back with its row. `dispose` disposes the piles.

Tests to add in `fx/destroyer.test.ts`. The setup builds a `FactorySite` for the mini factory and passes `sites`. With a site, `handles[0]` is the sign product, so job handles start at index 1; update the Task 15 tests the same way.
- **reject mode:**
  - an in-flight char is removed from the shelf at once
  - its handle is not disposed; it is carried and ends up in the site's hoist bin (its root's ancestor is `site.hoist.group`)
  - `'reject-kick'` is played
- **debris mode:**
  - after the shot, the slot state is `'debris'` and the text omits it
  - a second backspace targets the slot before it
  - after the broom sweep (step 6 s), both slots are removed and the pile is detached
- **gap:** a shelved space is removed only after the broom reaches it (before: `rows[0]` still has it, state `dying`)
- **relayout mid-sweep:**
  - start a debris sweep, call `host.relayout('snake')` then `site.rebuild()`
  - step 8 s
  - the slot is removed exactly once

- [ ] **Step 5: Wiring + HUD.**
- Scene: pass `sites` into the `Destroyer`. Construct the destroyer after the sites.
- HUD, after Camera:

```tsx
      <label>Backspace
        <select value={s.backspaceStyle} onChange={(e) => { e.target.blur(); set({ backspaceStyle: e.target.value as Settings['backspaceStyle'] }); }}>
          <option value="closeup">Close up</option>
          <option value="debris">Debris + broom</option>
        </select>
      </label>
      <label>On the line
        <select value={s.inflightBackspace} onChange={(e) => { e.target.blur(); set({ inflightBackspace: e.target.value as Settings['inflightBackspace'] }); }}>
          <option value="reject">Reject chute</option>
          <option value="shoot">Shoot</option>
        </select>
      </label>
```

(Import `type Settings` from `../engine/settings`.)

- [ ] **Step 6: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`. Then `pnpm dev`, in every look:
- **reject:** Backspace a letter on the belt; the claw drops, grips, carries it to the chute, and it slides into the bin
- **debris:** shelve `AB`, Backspace; a chunk pile stays, then the broom drives over and sweeps it
- **gap:** type `A B` and wait for the space to shelve, Backspace twice; the broom taps the gap

Take screenshots. Commit:

```bash
git add -A
git commit -m "feat(fx): reject hoist and chute, debris broom, backspace options

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Forklift row shipping (per-row damped planks, worker figure)

**Files:**
- Create: `factories/shared/figure.ts` (+test), `fx/forklift.ts` (+test)
- Modify: `shelf/view.ts` (+test), `fx/site.ts` (+test)

**Interfaces:**
- Consumes: `Shelf.readyToShip`, `SHELF_ROWS`, `Director.shipRow` (T13), `Building.dockDoor/dockPark` (T14).
- Produces:
  - `figure(looks: Looks): Figure` with `Figure = { group: THREE.Group; pose(walk: number, arm: number, seated?: boolean): void; dispose(): void }`. `walk` = gait phase in radians; `arm` = 0..1 raise; `seated` bends the hips and knees 90°.
  - `ShelfView.releaseRow(row: Slot[]): { group: THREE.Group; handles: ProductHandle[] } | null`
  - `ShelfView.rowEnd(row: Slot[]): Vec3 | null` = the +x end of that row's plank at its top, using the plank's current (damped) position
  - `class Forklift { group; constructor(looks, audio, park: Vec3, door: Vec3); setDock(park: Vec3, door: Vec3): void; fetch(target: () => Vec3 | null, onLift: () => { group: THREE.Group; handles: ProductHandle[] } | null): void; readonly busy: boolean; update(dt: number, speed: number): void; dispose(): void }`
  - `FactorySite.forklift`

- [ ] **Step 1: Per-row damped planks + `releaseRow`.**

In `shelf/view.ts`:
- Delete `VISIBLE_ROWS` and the row-hiding.
- Replace the single `planks` rebuild with a `Map<Slot[], THREE.Group>` of per-row plank groups, keyed by the row array (row arrays keep their identity until `shipRow` shifts them out).
  - `update` creates a group for any new row at its level position (newest = level 0, front).
  - It drops groups whose row left `shelf.rows`, unless the row was released.
  - It damps each group's `position.y` toward its level offset with the same `a = 1 - exp(-dt * 8)` as products.
  - `setOrigin` rebuilds all groups snapped to place.
- Each group holds one row's plank, its three posts and the foot, built at local coordinates relative to the row's level-0 position, so moving the group moves the whole plank.
- `shown()` becomes `Math.max(1, this.shelf.rows.length)`, and `bounds()` uses it.

```ts
  /** Forklift: hand over a row's plank and its products (world transforms kept); this view forgets them. */
  releaseRow(row: Slot[]): { group: THREE.Group; handles: ProductHandle[] } | null {
    const plank = this.rowGroups.get(row);
    if (!plank) return null;
    const load = new THREE.Group();
    this.group.add(load);
    load.attach(plank);
    this.rowGroups.delete(row);
    this.released.add(row);
    const handles: ProductHandle[] = [];
    for (const s of row) {
      const h = this.placed.get(s.id);
      if (!h) continue;
      this.placed.delete(s.id);
      load.attach(h.root);
      handles.push(h);
    }
    load.removeFromParent();
    return { group: load, handles };
  }
```

(`released` is a `WeakSet<Slot[]>` so `update` does not rebuild a released row's plank between `releaseRow` and `shipRow`.)

`shelf/view.test.ts`:
- Replace the `'shows the 3 newest rows'` test with `'draws a plank group per row; a new row makes older planks glide back'`. After `newline` + `update(1/60)`, the old plank's y has moved less than 40 but more than 0; after `update(2)` it is +40.
- Add `'releaseRow hands over the plank and its products undisposed'`. The returned group contains the plank meshes and every handle root, handles are not disposed, `slotPos` of the other rows is unchanged, and the row's plank is gone from the view group.
- Add `'rowEnd is the plank +x end at plank top'`.

- [ ] **Step 2: Worker figure.** Failing test `factories/shared/figure.test.ts`:
- `figure(looks)` meshes are all role-tagged and include `paint-accent` (hard hat), `copper` (vest), `paint` (clothes), `rubber` (boots) and `sand` (skin)
- the bounding box height is 40..44 and the feet are at z ≈ 0
- `pose(Math.PI / 2, 0)` swings the legs (left leg pivot rotation.y ≠ 0, opposite sign to the right)
- `pose(0, 1)` raises the right arm pivot above shoulder level
- `pose(0, 0, true)` lowers the hips to ≈ seat height 18

Implement `factories/shared/figure.ts`, a low-poly person facing +x:
- `paint` legs (boxes 5 × 5 × 18 on hip pivot groups at z 20) with `rubber` boots
- `paint` torso box 12 × 7 × 15 with a `copper` hi-vis vest shell (slightly larger box with a `glow`-free reflective strip as a thin `steel` band)
- `sand` head (sphere r 4.5) on a neck
- a `paint-accent` hard hat (half-sphere `lathe` + brim disc)
- `paint` arms on shoulder pivot groups at z 33, with `sand` hands
- **`pose(walk, arm, seated)`:**
  - legs: `rotation.y = ±0.5 * sin(walk)`
  - arms: swing opposite to the legs, plus the right arm raised by `arm * 2.2`
  - bob: `group.position.z += 0.8 * |sin(walk)|`, applied to an inner body group so the caller's position stays exact
  - seated: hips at 18, thighs forward 90°, shins down

- [ ] **Step 3: Forklift.** Failing test `fx/forklift.test.ts`, with park `[1200, -500, 0]`, door `[1310, -500, 0]` and the row end at `[900, -440, 18]`:
- `fetch(target, onLift)` drives over, and `onLift` is called once after ~3–4 s at speed 1. The `onLift` mock returns a load group with one fake handle.
- After the lift the load group is a descendant of the forklift group and rises ≥ 10.
- `'forklift-motor'` and `'forklift-beep'` are both played.
- After ~10 s the load handles are disposed, the load group is detached, `busy` is false and the forklift is back at park (distance < 1).
- At speed 3 the same trip takes about a third as long.
- `onLift` returning null (row vanished) aborts back to park without throwing.
- Every mesh is role-tagged, and the driver figure is present.

Implement `fx/forklift.ts`. Its local frame faces −x (forks point −x).

Parts:
- **Body and cab:** a `paint-accent` body (housing 40 × 28 × 16 on a 6 clearance), a `paint` counterweight (housing 14 × 28 × 18 at the rear, +x end), and a `rubber` seat.
- **Driver:** `figure(looks)` posed seated on the seat.
- **Overhead guard:** four `steel` posts plus a `steel` top frame at z 62.
- **Steering and wheels:** a `steel` steering column with a torus wheel; `rubber` wheels (front r 7, rear r 6), which spin with distance.
- **Mast and forks:** a `steel` mast (two uprights 4 × 6 × 70 at the front, −x end, with a crossbar); a `steel` carriage plate that moves up the mast; two `steel` forks 90 × 3.5 × 1.5 pointing −x from the carriage at z 4.
- **Beacon:** a `lamp` on the guard, on while busy, blinking.

Trip (positions are where the **fork tips' base** is; speed `140 * speed` units/s; turns at 3 rad/s; `beep` every 0.5 s while reversing; `forklift-motor` at the start of each forward leg):
1. Leave park forward to the aligned point: x = target.x + 100, y = target.y.
2. Insert: drive −x until the fork base is at target.x + 6 (the forks run 84 under the plank end), carriage at z = target.z − 6.
3. Lift (0.5 s): the carriage rises 14. At lift start call `onLift()`. If it returns null, abort. Otherwise `forks.attach(load.group)` so the plank and its products ride the carriage.
4. Reverse +x by 140.
5. Turn and drive forward to `door`, then 220 beyond it.
6. Dispose the load: each handle `dispose()` + detach, and dispose the load's plank geometries.
7. Return to park in reverse order: forward back through the door, turn, park facing −x.

- [ ] **Step 4: Site ships rows.** In `fx/site.ts`, create `forklift` once with `building.dockPark` / `building.dockDoor` (`setDock` on rebuild). In `update(realDt, night)`:

```ts
    const shelf = this.d.director.shelf(this.host.def.kind);
    if (!this.forklift.busy && shelf.readyToShip()) {
      const row = shelf.rows[0];
      this.forklift.fetch(
        () => this.host.shelfView.rowEnd(row),
        () => {
          if (shelf.rows[0] !== row) return null; // already gone (should not happen; defensive)
          const load = this.host.shelfView.releaseRow(row);
          this.d.director.shipRow(this.host.def.kind);
          return load;
        },
      );
    }
    this.forklift.update(realDt, 1 + Math.max(0, shelf.rows.length - SHELF_ROWS - 1)); // rows waiting → it hurries
```

`fx/site.test.ts`:
- **Overflow ships:** type four rows (`'ab\ncd\nef\ngh'`), stepping director + host + site until all are shelved and then 15 s more. Expect `row:shipped` once with chars `'ab'` and `shelf.rows.length === 3`, and the first two handles disposed.
- **Overflow catches up:** type six rows quickly, then step. The shelf ends at 3 rows, no job ever enters phase `destroyed` (listen on `job:phase`), and the text keeps the last 3 rows in order.
- **Relayout mid-fetch:** start a fetch, then `host.relayout('snake'); site.rebuild();` and step. The row is still shipped exactly once.

- [ ] **Step 5: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`. Then `pnpm dev`, in every look: type four lines (Enter between them). The older planks glide back. When the fourth row starts, the forklift beeps out of the dock, slides its forks under the oldest plank, lifts it with its letters, reverses and drives out through the dock door. Take screenshots. Commit:

```bash
git add -A
git commit -m "feat(fx): forklift ships the oldest shelf row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Workers, day/night, HUD toggles, docs

**Files:**
- Create: `fx/workers.ts` (+test)
- Modify: `engine/stage.ts`, `fx/site.ts` (+test), `components/Scene.tsx`, `hud/Hud.tsx`, `CLAUDE.md`

**Interfaces:**
- Consumes: `figure` (T17), `patrolLoop`/`sampleLoop`/`loopLength` (T13), `skyAtTime`/`Sky` (T13), `Building.setNight` (T14), `ConstructionSite.setNight` (T14).
- Produces:
  - `class Workers { group; constructor(looks: Looks, loop: Vec3[], count?: number); setLoop(loop: Vec3[]): void; update(dt: number): void; dispose(): void }`
  - `Stage.setSky(sky: Sky, looks: Looks): void`
  - `FactorySite.workers`

- [ ] **Step 1: Workers.** Failing test `fx/workers.test.ts`, using the loop `patrolLoop([0,-200,0],[600,0,90],45)`:
- `new Workers(looks, loop)` has 6 figures
- after `update(0.5)` each figure's xy lies on the loop rectangle (distance to the nearest edge < 0.01) and they are spread out (pairwise arc distance > 50)
- every walking worker faces the way it moves (displacement · facing > 0 over a 0.2 s step); exactly two move against the loop direction
- over 30 s of `update(1/30)`, at least one figure stands still for ≥ 1.5 s with its arm raised (`inspect`)
- `setLoop` moves them onto the new loop
- all meshes role-tagged

Implement `fx/workers.ts`:
- 6 `figure`s at arc offsets `i * L / 6`; workers 1 and 4 walk in reverse.
- **Walking:** 30 units/s; `rotation.z = heading` (+π when reversed); `pose(walk, 0)`, with walk += dt * 30 / 6.
- **Inspection:** each worker draws its next one from a seeded schedule, 6–12 s apart (`mulberry32(i + 1)`, inline 4-line PRNG). It stops for 2 s, turns to face the line (+y, `rotation.z = π / 2`) and raises the arm (`pose(0, 1)`).

- [ ] **Step 2: Site workers.** In `fx/site.ts`:
- Create `workers` once with `patrolLoop(host.layout.bounds.min, host.layout.bounds.max, 45)` at z 0; `setLoop` on rebuild.
- In `update`: `this.workers.group.visible = this.d.settings().workers;` then, if visible, `this.workers.update(realDt)`.

`fx/site.test.ts`: workers exist, hide when `settings.workers = false`, and follow a relayout.

- [ ] **Step 3: Stage sky.** In `engine/stage.ts`, add `setSky(sky: Sky, looks: Looks)`:
- **Lights:** sun colour = `sky.sunColor`; sun intensity = the look base (`flat` 1.8, else 2.4) × `sky.sunScale`; hemi intensity = the look base (`flat` 1.2, else 0.7) × `sky.hemiScale`.
- **Sun direction:** keep the last `fitShadow` centre and radius, and place `sun.position = centre + sunDir * 1500`. Replace the fixed `SUN_DIR` with the current `sky.sunDir`, which defaults to `SUN_NOON`.
- **Background:** for every look except `lineart`, `scene.background = looks.background().lerp(new THREE.Color(0x070a14), 0.75 * sky.night)`. Reuse one `Color`; no allocation per frame.
- `setLook` keeps its base intensities so `setSky` can scale them. With `dayNight` off, noon reproduces today's frame exactly.

- [ ] **Step 4: Scene + HUD.** In `components/Scene.tsx`:

```ts
    let lastNight = 0;
    const t0 = performance.now();
    // in update():
        const sky = skyAtTime((t - t0) / 1000, settings().dayNight);
        stage.setSky(sky, looks);
        if (lastNight > 0.5 && sky.night <= 0.5) audio.play('factory-bell'); // dawn
        lastNight = sky.night;
        sites.get(cur)?.update(realDt, sky.night);
        for (const y of yards) { y.update(realDt); y.setNight(sky.night > 0.5); }
```

`applyLook` must call `stage.setSky` again after `stage.setLook`. The day/night cycle keeps the loop awake (the subsystem already returns true).

`hud/Hud.tsx`, after Quality:

```tsx
      <label className="hud-row">
        <input type="checkbox" checked={s.dayNight} onChange={(e) => { e.target.blur(); set({ dayNight: e.target.checked }); }} />
        Day / night
      </label>
      <label className="hud-row">
        <input type="checkbox" checked={s.workers} onChange={(e) => { e.target.blur(); set({ workers: e.target.checked }); }} />
        Workers
      </label>
```

- [ ] **Step 5: Docs.** Update `CLAUDE.md`:
- **"What this is":** products are letter, bottle, cookie, donut, mug, can, toy car; the campus and picker; backspace and forklift are landed.
- **"Where things are":** add this spec and plan as current.
- **Architecture:**
  - `engine/{campus,backspace,dayNight,patrol}`
  - director pending/active-only/`shipRow`
  - shelf `readyToShip`/per-row planks/`releaseRow`/`release`
  - registry `PLOTS`
  - `factories/shared/{building,figure}`
  - the `fx/` folder: ground, construction, site, fragments, shotgun, destroyer, hoist, broom, forklift, workers, testkit
  - HUD additions
- **Particles rule:** user-triggered fx may emit; nothing ambient.

- [ ] **Step 6: Verify and commit.** Run `pnpm typecheck && pnpm test && pnpm build`. Then `pnpm dev`, in every look:
- workers walk the loop around the line, sometimes stopping to look and raise an arm
- leave it running about 80 s: dusk turns the light orange then blue, the windows and lamps glow, and the bell rings at dawn
- toggling Day/night off snaps back to the noon frame; toggling Workers hides them

Take a screenshot at night. Commit:

```bash
git add -A
git commit -m "feat(fx): workers and day/night cycle; docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

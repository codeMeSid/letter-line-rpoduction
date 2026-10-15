# Letter Factory Line — Implementation Plan

Source request and Q&A rulings: `docs/original-plan.md` (the approved high-level plan).
This file is the executable plan. Tasks are executed in order, one at a time.

## Product summary

A full-page Next.js app. The user types; each printable key starts a production job on an
animated isometric line-art factory (Hairline aesthetic) that turns raw material into a
finished product bearing that character, and a robot places it on a typewriter-style shelf in
front of the factory. Space leaves an empty shelf slot. Backspace destroys the last slot
(shotgun / reject chute / gap-remover arm). Six products, each with its own factory building;
switching product pans the camera to that building. Procedural sound for every machine.
Collapsible HUD exposes every option.

## Global Constraints (binding on every task)

1. **Stack:** Next.js 15 (App Router) + React 19 + TypeScript (strict) + pnpm. State for settings:
   `zustand`. Unit tests: `vitest` (node environment unless a test needs `jsdom`). No other
   runtime dependencies without a ruling in `docs/PROGRESS.md`.
2. **Commands that must pass before every commit:** `pnpm typecheck` (`tsc --noEmit`),
   `pnpm test` (`vitest run`), `pnpm build` (`next build`). Test output must be clean (no warnings).
3. **Hairline kernel is vendored unchanged** at `public/hairline/kernel.js` (byte-identical copy of
   `/Users/sid/.claude/skills/hairline-create/kernel.js`). Never edit it. It is a classic script that
   defines a global `var HL`. Loaded in `app/layout.tsx` via `next/script` with
   `strategy="beforeInteractive"`. App code reaches it only through `lib/hl.ts`.
   Tests that need it load it with `lib/hl.node.ts` (reads the file, evaluates
   `new Function(src + ";return HL;")()`).
4. **Projection:** one camera for the whole world: `C = HL.Cam(45, 0.5, 1)` with `C.ox = C.oy = 0`,
   `P = HL.proj(C)`. World units: x/y on the ground, z up. SVG user units = `P(x,y,z)`.
   The camera module pans/zooms by animating the root `<svg>` `viewBox`, never by re-projecting.
   Because the projection is affine, a moving object is drawn once at world origin and moved with
   an SVG `transform="translate(sx sy)"` where `[sx, sy] = P(pos) - P(0,0,0)`. Redraw paths only
   when an object's shape changes.
5. **Paint order (Hairline rule 06):** within a factory, append back to front by ascending `x + y`
   (then ascending z). Plates are filled with the ground colour (default kernel CSS), so nearer
   solids hide farther ones.
6. **Visual language:** solids via `HL.rings` + `HL.prism` + `HL.solid` + `HL.put` (silhouette + one
   crease, rounded corners). Palette = kernel classes only (`sil`, `hi`, `lo`, `nf`, `fo`, `dash`,
   `dot`, `dot m`, `dot off`) plus the project's accent classes defined once in
   `app/globals.css`: `acc-molten`, `acc-drink`, `acc-neon`, `acc-flash`, `acc-glass`,
   `acc-label`. Accent classes only colour stroke/fill when the root element has
   `data-color="accent"`; under `data-color="mono"` they fall back to `hi`-stroke, no fill colour.
   No other inline colours in SVG. Canvas particles take colours from `engine/palette.ts`, which
   reads the CSS variables (`--hl-hi`, `--hl-edge`, `--hl-plate`, accent vars) so theme/colour mode
   apply.
7. **Theme:** root wrapper has `data-hairline` (to get kernel CSS vars) and
   `data-hairline-theme="light|dark"`. Kernel CSS gives `[data-hairline]` `aspect-ratio:5/4`;
   override it in `app/globals.css` so the world fills the viewport (`100vw x 100vh`, no scroll).
   Call `HL.inject(document)` once on mount.
8. **Animation clocks (Hairline rules 07/08):** all motion runs inside a single
   `HL.register(stage, tick)` loop owned by `engine/loop.ts`. No `setInterval`, no own
   `requestAnimationFrame`, no CSS keyframe animations for scene objects (CSS transitions on HUD
   React UI are fine). Discrete changes use `HL.tween/tset/tval` (700ms default); continuous ones
   use `HL.spring/stepS`. Sim time: `simDt = realDt * clock.speedMul`. Reduced motion
   (`HL.reducedMotion()`): springs/tweens land instantly and particle counts are cut to 20%.
9. **Letters inside the drawing** are allowed (deliberate break from Hairline rule 10), drawn only
   with the single-stroke glyph set in `engine/glyphs.ts`. No `<text>` elements in the world SVG.
10. **Sound:** all sound goes through `audio/bus.ts` (`AudioBus`). Providers implement
    `AudioProvider`. The procedural Web Audio synth (`audio/synth.ts`) is the active provider; the
    sample provider (`audio/samples.ts`) is a stub kept for later. AudioContext is created/resumed
    only on the first user keydown/pointerdown (autoplay policy).
11. **Client only:** the scene is mounted via `dynamic(() => import(...), { ssr: false })`. No
    `window`/`document` access at module top level in any file imported by server components.
12. **Files stay focused:** one responsibility per file; aim for under ~350 lines per file. Each
    station is its own file.
13. **Charset:** `A-Z a-z 0-9` and punctuation `. , ! ? ' " - _ : ; ( ) / & @ # + = * %`. Any other
    key is ignored. Specials: `.` → cap-only product, `!` → exploding product, digits → numbered
    crate (crate with the digit stamped). All other punctuation renders as its glyph on the normal
    product.
14. **Handoff docs:** every task that changes architecture, commands, or file layout updates
    `CLAUDE.md` in the same commit. Implementers never edit `docs/PROGRESS.md` (the controller owns it).

## Shared interfaces (canonical; later tasks must use these names)

```ts
// engine/types.ts
export type Vec3 = [number, number, number];
export type ProductKind = 'bottle' | 'can' | 'mug' | 'cookie' | 'neon' | 'brick';
export type LayoutMode = 'snake' | 'pan' | 'stacked' | 'all';
export type Special = 'none' | 'cap' | 'explode' | 'crate';
export type JobPhase = 'queued' | 'conveyor' | 'station' | 'placing' | 'shelved' | 'rejected' | 'destroyed';

export interface SlotRef { row: number; col: number; slotId: number }

export interface Job {
  id: number;
  slotId: number;          // shelf slot reserved at keypress
  char: string;            // '' for space carrier
  isSpace: boolean;
  special: Special;
  product: ProductKind;
  stage: string;           // product visual stage id, set by the station that last finished it
  phase: JobPhase;
  stationIndex: number;    // current or last station index (-1 before first)
  progress: number;        // 0..1 within current station or conveyor segment
  pos: Vec3;               // world position, maintained by Line
  defect: boolean;
  retries: number;
}
```

```ts
// engine/settings.ts (zustand vanilla store + React hook)
export interface LetterMarks { emboss: boolean; label: boolean; cap: boolean; shape: boolean }
export interface Settings {
  product: ProductKind;               // default 'bottle'
  layout: LayoutMode;                 // default 'snake'
  letterMarks: LetterMarks;           // default { emboss: true, label: true, cap: false, shape: false }
  colorMode: 'accent' | 'mono';       // default 'accent'
  theme: 'light' | 'dark';            // default 'dark'
  backspaceStyle: 'closeup' | 'debris';    // default 'closeup'
  inflightBackspace: 'reject' | 'shoot';   // default 'reject'
  camera: 'overview' | 'follow' | 'cinematic'; // default 'overview'
  dayNight: boolean;                  // default true
  workers: boolean;                   // default true
  defects: boolean;                   // default true
  defectRate: number;                 // 0..0.3, default 0.06
  idleDemo: boolean;                  // default true
  forklift: boolean;                  // default false
  sound: boolean;                     // default true
  volume: number;                     // 0..1, default 0.6
  hudOpen: boolean;                   // default false
}
export const settingsStore; // zustand/vanilla createStore<Settings & { set(p: Partial<Settings>): void }>
export function useSettings<T>(sel: (s: Settings) => T): T;
```

```ts
// engine/station.ts
export interface StationCtx {
  P: (x: number, y: number, z: number) => [number, number];
  layer: SVGGElement;          // this station's own group, already positioned in paint order
  origin: Vec3;                // station anchor in world coords (station draws relative to it)
  particles: ParticleSystem;   // engine/particles.ts
  audio: AudioBus;             // audio/bus.ts
  settings: () => Settings;
  now: () => number;           // ms
}
export interface StationDef {
  id: string;                  // e.g. 'furnace'
  label: string;               // short human name for HUD/camera
  footprint: [number, number]; // world size x,y used by layout
  height: number;              // world z extent (for camera fit)
  duration: number;            // sim seconds to process one job at speedMul 1
  spaceDuration?: number;      // seconds for a space carrier (default 0.25)
  outputStage?: string;        // product stage after this station finishes a job
  create(ctx: StationCtx): StationInstance;
}
export interface StationInstance {
  begin(job: Job): void;                       // job arrived at anchor
  update(dt: number, job: Job | null, t: number): void; // every frame; t = job progress 0..1
  finish(job: Job): 'pass' | 'reject';         // inspection may return 'reject'
  destroy(): void;
}
```

```ts
// engine/product.ts
export interface ProductRenderer {
  kind: ProductKind;
  stages: string[];                            // ordered visual stages
  draw(g: SVGGElement, job: Job, marks: LetterMarks, P: StationCtx['P']): void; // draws at world origin
  size: Vec3;                                  // bounding size for shelf slot spacing
}
```

```ts
// engine/factory.ts
export interface FactoryDef {
  kind: ProductKind;
  label: string;              // HUD dropdown label e.g. 'Glass bottle'
  stations: StationDef[];     // in process order; last must be the robot/placer
  product: ProductRenderer;
  rawMaterials: string[];     // names for the pour animation at station 0
}
```

Line (pipeline): `engine/line.ts` — `class Line { constructor(stations: StationDef[], anchors: Vec3[], paths: Vec3[][]); enqueue(job); tick(simDt); jobs: Job[]; onPhase(cb) }`.
Each station has capacity 1. Conveyor segment i runs from anchor i to anchor i+1 along `paths[i]`
(polyline) at `CONVEYOR_SPEED = 40` world units / sim second, minimum spacing `MIN_GAP = 14`
world units between jobs on a segment. A job advances into station i+1 only when it is empty.
FIFO is preserved per segment.

Shelf model: `shelf/model.ts` — pure, see Task 2.

Input: `engine/input.ts` maps `KeyboardEvent` → `Command`:
`{ type: 'char', char } | { type: 'space' } | { type: 'backspace' } | { type: 'enter' }`, or `null`.
Ignores events with ctrl/meta/alt held, repeats of Enter, and keys outside the charset; ignores
keys while focus is in an `input`, `select`, `textarea` or `[contenteditable]` (HUD controls).

Director: `engine/director.ts` — owns `Shelf`, `Line`s per factory, routes Commands, and handles backspace
cases (Task 8). All visual side effects subscribe to director events:
`'job:created' | 'job:phase' | 'slot:reserved' | 'slot:filled' | 'slot:removed' | 'slot:debris' | 'row:new' | 'row:shipped' | 'destroy:shoot' | 'destroy:reject' | 'destroy:gap'`.

## World layout

Factories sit side by side along +x, 1600 world units apart: origin of factory k =
`[k * 1600, 0, 0]` in the order `bottle, can, mug, cookie, neon, brick`.
Within a factory, `engine/layout.ts` places stations for a `LayoutMode`; the shelf stands in front
of the line (larger x + y side), facing the viewer.

---

### Task 1: Scaffold Next.js app, vendor Hairline kernel, typed wrapper

**Files:** `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`,
`.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/hairline/kernel.js`,
`lib/hl.ts`, `lib/hl.node.ts`, `lib/hl.test.ts`, `components/Scene.tsx` (placeholder), `README.md` (short).

1. Create the app manually or with `create-next-app` (TypeScript, App Router, no Tailwind, no
   src dir, ESLint optional). Scripts: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`),
   `test` (`vitest run`). Add deps `zustand`; dev deps `vitest`, `jsdom`.
2. Copy kernel byte-identical: `cp /Users/sid/.claude/skills/hairline-create/kernel.js public/hairline/kernel.js`.
   Add test asserting its sha256 matches the hash in its first line comment
   (`346b48bdef2cdfafd5343eba01494255cf75f9c078e6fcd1aafc62bab62980a1` is the hash printed in the file
   header; test that the header line is intact and that the file starts with `/* hairline kernel sha256:`).
3. `lib/hl.ts`: a typed interface `HLKernel` covering every function listed in the kernel index
   (Camera, Rounded solids, Paths and numbers, springs, tweens, Drawing, Life, css/inject/tour/LAP),
   and `export function hl(): HLKernel` returning `window.HL` (throws a clear error if missing).
   Types: `Cam` object `{ az: number; k: number; S: number; ox: number; oy: number }`;
   `Ring = { u: number; v: number; nu: number; nv: number }[]`; `Spring = { x: number; v: number; t: number }`
   (inspect the kernel to confirm fields; read code below the index only for type shapes).
4. `lib/hl.node.ts`: `loadHL(): HLKernel` for tests (evaluates the vendored file).
   `lib/hl.test.ts`: proj/unproj round-trip for `Cam(45,0.5,1)`; `rings` + `prism` return
   non-empty path strings; `tween` reaches its target after 700ms via `tval`.
5. `app/layout.tsx`: html/body, `<Script src="/hairline/kernel.js" strategy="beforeInteractive" />`.
   `app/page.tsx` renders `<Scene />` via `next/dynamic` with `ssr:false`.
   `components/Scene.tsx`: client component that calls `hl().inject(document)` and draws one test
   prism in a full-viewport `<svg>` inside a `<div data-hairline data-hairline-theme="dark">`.
6. `app/globals.css`: reset; full-viewport root; override kernel aspect-ratio; define accent CSS
   variables and the accent classes per Global Constraint 6 (accent vars: `--acc-molten #ff7a1a`,
   `--acc-drink #3a1a0e`, `--acc-neon #ff3df0`, `--acc-flash #fff4c2`, `--acc-glass #9fd8c8`,
   `--acc-label #d92b2b`), mono fallback.
7. `.gitignore` includes `.superpowers/`, `.next/`, `node_modules/`, `out/`.

**Acceptance:** `pnpm typecheck && pnpm test && pnpm build` pass; dev page shows one rounded
prism on dark ground. Update `CLAUDE.md` commands section if anything differs.

### Task 2: Core pure logic (tested): types, settings, clock, line, layout, shelf, input, share

**Files:** `engine/types.ts`, `engine/settings.ts`, `engine/clock.ts`, `engine/line.ts`,
`engine/layout.ts`, `engine/input.ts`, `engine/charset.ts`, `shelf/model.ts`, `lib/share.ts`,
`engine/events.ts` (tiny typed emitter), plus a `*.test.ts` next to each.

No DOM in these files. All exact values below are binding.

1. `engine/types.ts`: the shared types from "Shared interfaces" verbatim.
2. `engine/charset.ts`: `CHARSET` string, `isPrintable(ch)`, `specialFor(ch): Special`
   (`.`→cap, `!`→explode, `0-9`→crate, else none).
3. `engine/settings.ts`: store + hook + defaults exactly as specified. `defaultSettings` exported.
4. `engine/clock.ts`: `class Clock { recordKey(nowMs); wpm(nowMs): number; speedMul(nowMs): number }`.
   WPM = (keys in last 10 000 ms) / 5 * 6. `speedMul = clamp(1 + wpm/60, 1, 4)`.
5. `engine/events.ts`: `createEmitter<EventMap>()` with `on(type, fn) → off`, `emit(type, payload)`.
6. `engine/layout.ts`: `layoutStations(defs: {footprint:[number,number]; height:number}[], mode: LayoutMode, origin: Vec3)`
   → `{ anchors: Vec3[]; paths: Vec3[][]; floors: number[]; bounds: { min: Vec3; max: Vec3 }; shelfOrigin: Vec3; shelfAxis: Vec3 }`.
   Station pitch = footprint + `GAP = 60` world units.
   - `pan`: one straight row along +x at y=0, z=0.
   - `snake`: rows of `PER_ROW = 5` along x, alternating direction, rows stacked along +y with row
     pitch = max footprint y + 120; connecting path does a U-turn at row ends.
   - `stacked`: floors of `PER_ROW = 5` stations, each floor z = floorIndex * 140, all rows going +x
     then a vertical lift path at the row end up to the next floor and back to x start along a return
     conveyor at y = -80.
   - `all`: floors (z step 140) where each floor is a 2-row snake of up to 10 stations.
   - `paths[i]` is the polyline from `anchors[i]` to `anchors[i+1]` (length = n-1), all segments
     axis-aligned.
   - `shelfOrigin`: in front of bounds: `[bounds.min[0], bounds.max[1] + 160, 0]`, `shelfAxis = [1,0,0]`.
   Tests: correct anchor counts; no two station footprints overlap; each path starts/ends at the
   right anchors; all modes deterministic.
7. `engine/line.ts`: `Line` per the shared interface, pure (positions computed by interpolating
   paths). Emits phase changes through a callback. Uses each `StationDef.duration` (or
   `spaceDuration`) and `finish()` result supplied by an injected `decide(job, stationIndex): 'pass'|'reject'`
   function (so it stays pure; runtime supplies the instance call). Rejected job → phase
   `rejected`, removed from the line, callback fires. `remove(jobId)` removes a job anywhere
   (used by backspace). `relayout(anchors, paths)` re-maps in-flight jobs keeping stationIndex/progress.
   Tests: FIFO order; capacity 1; spacing; reject; remove frees station; relayout.
8. `shelf/model.ts`: `class Shelf { cols = 14; rows: Slot[][]; reserve(kind:'char'|'space', char): SlotRef; newline(): void; shipRow(): Slot[] | null; peekLast(): Slot | {kind:'newline'} | null; markFilled(slotId); markDebris(slotId); remove(slotId); text(): string; slotPos(slotId): {row:number; col:number} }`
   `Slot = { id; kind:'char'|'space'; char; state:'reserved'|'filled'|'debris'|'dying'; jobId:number|null }`.
   Auto-wrap at `cols`. `newline()` starts a new row (rows end marker kept so backspace can remove it).
   `peekLast()` skips slots in state `dying` or `debris` (those are already being destroyed) and
   returns a newline marker when the last row is empty and a previous row exists.
   `shipRow()` removes the first full or newline-terminated row (forklift) and returns its slots.
   `text()` returns the shelf text with `\n` between rows (for share URL).
   Tests: wrap, newline, backspace targets, debris skipping, ship.
9. `engine/input.ts`: `keyToCommand(e: {key; ctrlKey; metaKey; altKey; repeat; target?}): Command | null` per spec above.
10. `lib/share.ts`: `encodeShare({product, text, settings: Partial<Settings>}) → string` (query string:
    `p`, `t` base64url of UTF-8 text, `s` base64url JSON of non-default settings) and `decodeShare(search)`.
    Round-trip test incl. newlines and punctuation; invalid input returns null, never throws.

**Acceptance:** all tests pass; no DOM imports in these files.

### Task 3: Single-stroke glyph set + surface projection

**Files:** `engine/glyphs.ts`, `engine/glyphs.test.ts`, `engine/surface.ts`, `engine/surface.test.ts`.

1. `GLYPHS: Record<string, number[][][]>`: each char = list of strokes, each stroke = list of
   `[u, v]` in a unit cell (u 0..0.7 width, v 0..1 height, v down). Hand-designed, readable
   single-stroke (Hershey-like) for all of `CHARSET`. Curves use enough points (≥8 per arc) to read
   at 12 px tall. Lowercase uses x-height 0.55 with ascenders/descenders.
2. `glyph(ch)`: strokes; unknown → `?`.
3. `engine/surface.ts`: surfaces mapping `(u, v)` to world `Vec3`:
   `flatSurface(origin, uAxis, vAxis, size)`, `cylinderSurface(center, radius, z0, height, facingAngle, arc)`
   (wraps text around a cylinder facing the camera; used by bottle/can/mug labels and emboss),
   `topSurface(center, radius)` (cap/lid, flat on top).
   `glyphPaths(ch, surface, P, opts?: { scale?: number; offset?: [number,number] }): string` — returns
   one SVG path `d` of open polylines; strokes on a cylinder whose normal faces away from camera are
   culled per segment (use the kernel `facing` convention, camera azimuth 45°).
4. Tests: every CHARSET char has ≥1 stroke; all points inside the cell; `glyphPaths` non-empty for a
   front-facing cylinder and empty for a fully back-facing arc.

### Task 4: Audio bus, procedural synth provider, samples stub

**Files:** `audio/types.ts`, `audio/bus.ts`, `audio/synth.ts`, `audio/samples.ts`, `audio/bus.test.ts`.

1. `SoundName` union (binding list): `key-clack`, `ding`, `pour-sand`, `mixer-churn`, `furnace-roar`
   (loop), `gob-shear`, `mould-clamp`, `air-blow`, `lehr-hum` (loop), `camera-flash`, `laser-zap`,
   `reject-kick`, `water-jet`, `filler-pour`, `cap-press`, `labeler-wrap`, `coder-tick`,
   `robot-servo`, `conveyor-hum` (loop), `motor-whir`, `kiln-roar` (loop), `oven-hum` (loop),
   `press-thump`, `hiss`, `neon-buzz` (loop), `bend-squeak`, `injection-thunk`, `shotgun-rack`,
   `shotgun-blast`, `glass-shatter`, `liquid-splash`, `ceramic-shatter`, `crunch`, `metal-crumple`,
   `plastic-crack`, `broom-sweep`, `forklift-beep`, `forklift-motor`, `explosion-fizz`, `whoosh`, `factory-bell`.
2. `AudioProvider { init(ctx: AudioContext, out: AudioNode): void; play(name, opts: {pan?: number; gain?: number; rate?: number}): void; loop(name, opts): LoopHandle; }`
   `LoopHandle { setGain(g, rampMs?); stop() }`.
3. `AudioBus`: lazy `AudioContext` created on `unlock()` (called on first user gesture),
   master gain = settings.volume (0 when sound off), per-name throttle (min 40ms between same
   name; key-clack min 15ms), max 24 voices (drop oldest), `pan` from world x relative to camera
   center via `setListener(xCenter, halfWidth)`. `setProvider(p)`. Before unlock, play/loop are
   no-ops that do not throw; loops requested before unlock start after unlock.
4. `audio/synth.ts`: every SoundName implemented with Web Audio nodes only (oscillators, noise
   buffers, filters, envelopes). Typewriter clack must sound like a mechanical key; shotgun = rack
   (two clicks) + blast (noise burst + low thump); glass shatter = many short high band-passed
   noise pings.
5. `audio/samples.ts`: `SampleProvider` implementing `AudioProvider` with an empty
   `SAMPLE_URLS: Partial<Record<SoundName, string>>`; falls back to no-op for missing names. Not
   wired by default. Comment at top: how to add base64 samples later.
6. Tests (node, fake AudioContext stub): throttle, voice cap, pre-unlock no-op, volume mapping.

### Task 5: Runtime engine: world SVG, camera, particles, loop, factory host, shelf renderer, director

**Files:** `engine/loop.ts`, `engine/camera.ts`, `engine/particles.ts`, `engine/palette.ts`,
`engine/world.ts`, `engine/factoryHost.ts`, `engine/director.ts`, `engine/productView.ts`,
`shelf/view.ts`, `factories/registry.ts`, `factories/demo/index.ts` (temporary generic factory),
`components/Scene.tsx`, tests for director routing (`engine/director.test.ts`, pure parts).

1. `engine/world.ts`: creates the root `<svg>` (full viewport), layers in order:
   `bg` (floor grid, building shells), `factories` (one `<g>` per factory), `shelves`, `fx`
   (shotgun, chute, forklift), and a `<canvas>` overlay above the svg (pointer-events none) for
   particles. Root wrapper gets `data-hairline`, `data-hairline-theme`, `data-color`.
2. `engine/camera.ts`: viewBox `{x,y,w,h}` driven by four `HL.spring`s; `fitBox(min,max,pad)`
   computes target from projected 3D bounds keeping viewport aspect; `panTo(box, ms=1200)` uses a
   tween for factory switches; modes: `overview` (fit current factory + shelf), `follow`
   (center on newest in-flight job, zoom so ~3 stations visible), `cinematic` (every 4s move to the
   busiest station, zoom 2.2x, slow drift). `worldToScreen(v: Vec3) → [px, py]` CSS pixels for the
   canvas; `screenScale()` px per svg unit. Exposes `center()` for audio panning.
3. `engine/loop.ts`: the single `HL.register(stage, tick)`; subsystems register `update(simDt, realDt, now)`.
   Returns true while any subsystem is active (ambient machines → effectively always while visible).
4. `engine/particles.ts`: pooled particles (max 4000), kinds: `sand`, `powder`, `spark`, `ember`,
   `glow`, `liquid`, `droplet`, `foam`, `shard`, `smoke`, `steam`, `water`, `flash`, `crumb`,
   `confetti`, `pellet`. `emit(kind, { pos: Vec3; count; spread?: number; vel?: Vec3; life?: number; size?: number })`.
   Simulated in world space (gravity on z, floor at the emitting z or 0), drawn on the canvas via
   `camera.worldToScreen`. Colours from `engine/palette.ts` (reads CSS vars, refreshed on theme or
   colour-mode change). Additive blending for `glow`, `spark`, `flash`, `ember`.
5. `engine/productView.ts`: one `<g>` per job; draws via `ProductRenderer.draw` at origin and
   moves with translate (Global Constraint 4); redraws only when `job.stage` or marks change.
6. `engine/factoryHost.ts`: mounts a `FactoryDef` at its world origin: computes layout, creates
   station layers in paint order, draws conveyors (rounded belt plates with roller marks; belt
   texture scrolls by moving dashed `lo` lines with an offset proportional to sim time), instantiates
   stations, owns the `Line`, calls instance `begin/update/finish`. Supports `relayout(mode)`
   (destroy + recreate station visuals, `line.relayout`). Only the active factory and any factory
   inside the camera box get `update` calls (culling).
7. `shelf/view.ts`: draws the shelf for a factory: wooden-style multi-row plank solids (prism plates)
   with brackets; slot spacing from `ProductRenderer.size`; renders filled products at slot
   positions; empty space slots show nothing; debris slots show a debris group (Task 8 fills it).
   Shelf grows rows upward/backward like lines on a page (row 0 top). Must fit `cols=14`.
8. `engine/director.ts`: owns `Shelf` per factory, `Clock`, the event emitter. `handle(cmd)`:
   char/space → reserve slot, create Job, enqueue on the active factory's Line, `key-clack` sound;
   enter → `shelf.newline()` (or `shipRow` when forklift setting on, emits `row:shipped`);
   backspace → for now: if last slot is a space or newline, remove it; if char, remove job/slot
   (Task 8 replaces with full behaviour via a `BackspaceHandler` interface:
   `handleBackspace(target, ctx)` registered by Task 8). Robot placement: when a job finishes the
   last station, phase `placing` → animate along an arc from the last anchor to its slot position over 0.8s,
   then `shelved`, `shelf.markFilled`, `ding` at row end (col 13).
9. `factories/demo/index.ts`: temporary `FactoryDef` with 4 generic box stations (hopper, press,
   oven, robot) and a simple product (rounded block with the glyph on its front face) so the full
   loop is visible. Registry: `factories/registry.ts` maps `ProductKind` → `FactoryDef`
   (demo registered as `bottle` until Task 6).
10. `components/Scene.tsx`: mounts world, loop, camera, director; keyboard listener on window via
    `keyToCommand`; unlocks audio on first gesture; subscribes to settings (theme/color attributes,
    layout → relayout, product → camera pan).

**Acceptance:** typing produces jobs that ride the demo line and land on the shelf in order, space
leaves a gap, Enter wraps, backspace removes; 60fps with 20 jobs in flight on a laptop (log frame time
in dev only via `?debug=1` overlay). Tests pass.

### Task 6: Bottle factory part 1 — raw material to inspection (stations 1–7) + bottle product

**Files:** `factories/bottle/index.ts`, `factories/bottle/product.ts`,
`factories/bottle/stations/{silos,mixer,furnace,gobShear,isMachine,lehr,inspection}.ts`,
`factories/shared/parts.ts` (reusable machine parts: hopper, pipe, motor, piston, gauge, chimney,
belt rollers, control panel, warning light), registry update.

Each station: detailed solids (≥6 parts each), idle ambient motion, per-job animation synced to
`t`, sounds, particles. Exact behaviours:

1. **Silos** (`silos`, duration 1.6s): four tall silos (sand, soda ash, limestone, cullet) with
   cone bottoms; on begin, each gate opens in turn (stagger 120ms, Hairline rule 02) and pours
   `sand`/`powder`/`shard`(small, cullet) particles into a weigh hopper; `pour-sand`. Fill level
   lines inside silos drop slightly per job and refill slowly at idle.
2. **Mixer** (`mixer`, 1.4s): weigh hopper scale needle swings, then drum mixer with rotating paddles
   (spring-driven speed), `mixer-churn`, powder puff. Output stage `batch`.
3. **Furnace** (`furnace`, 1.8s): brick-coursed furnace body, chimney with `smoke`, glowing mouth
   (`acc-molten`), flickering flame tongues (ambient, path morph each frame from noise), `ember`
   particles, `furnace-roar` loop whose gain rises when a job is inside. Output stage `molten`.
4. **Gob shear** (`gobShear`, 1.0s): feeder spout; molten stream (`acc-molten`) stretches, scissor
   blades close (tween), glowing gob drops into a chute; `gob-shear`, `spark`. Output stage `gob`.
5. **IS machine** (`isMachine`, 2.2s): blank mould halves close on the gob → parison (stage
   `parison`); arm flips it 180° over the top into the blow mould (tween on arc); blow mould closes,
   `air-blow` hiss, mould opens revealing a glowing bottle (stage `bottle-hot`). If
   `letterMarks.emboss`, the embossed glyph appears on the bottle body here (bright stroke). `mould-clamp`.
6. **Lehr** (`lehr`, 2.0s): long annealing tunnel with heat shimmer lines and vents (`steam`);
   bottle colour transitions from `acc-molten` to `acc-glass` along the tunnel (stage `bottle`);
   `lehr-hum` loop.
7. **Inspection** (`inspection`, 1.2s): camera head with lens; laser sweep line crosses the bottle
   (`laser-zap`), flash (`flash` particle + `camera-flash`). Decides reject when `job.defect`
   (defect flag is assigned at job creation in Task 10; for now `false`). Reject animation is a
   pusher arm (Task 8 adds the chute; here just return `'reject'` when defect).
8. **Bottle product** (`factories/bottle/product.ts`): classic contour bottle silhouette (shoulder,
   waist, heel) built as a lathe: sample the profile radius at ~14 heights and draw silhouette as the
   hull of projected circles per segment + 2–3 dim contour lines; stages: `batch` (powder heap),
   `molten`/`gob` (glowing blob), `parison` (short tube), `bottle-hot` (orange glass), `bottle`
   (clear glass), `rinsed`, `filled` (dark liquid inside, `acc-drink` fill clipped to the bottle with
   a foam line), `capped` (crown cap with crimps), `labeled` (red band label `acc-label` with glyph
   in white/bright stroke when `letterMarks.label`), `coded` (tiny dot row near the heel). Marks:
   emboss → glyph relief on body (from `bottle-hot` on), cap → glyph on cap top, shape → glyph
   strokes drawn as a thick glass tube standing in place of the body (two offset strokes).
   Specials: `cap` → only a crown cap is produced (stations still run; product drawn as cap);
   `crate` → a small wooden crate with the digit stamped on the front; `explode` → normal bottle
   flagged; Task 8 animates it on the shelf.
9. Registry: `bottle` → this factory (stations 1–7 then temporary robot from demo until Task 7).

**Acceptance:** visually rich, every station animates and sounds; build/test pass.

### Task 7: Bottle factory part 2 — rinse to robot (stations 8–13)

**Files:** `factories/bottle/stations/{rinser,filler,capper,labeler,coder,robotArm}.ts`,
`factories/shared/robotArm.ts` (reusable articulated arm used by every factory), updates to
`factories/bottle/index.ts`.

1. **Rinser** (`rinser`, 1.2s): gripper inverts the bottle (rotate tween), water jets (`water`
   particles) spray up, drip, flips back; `water-jet`. Stage `rinsed`.
2. **Filler** (`filler`, 2.0s): rotary carousel with 8 valves on a ring (rotates continuously,
   spring speed up when a job enters); valve lowers, dark beverage stream (`acc-drink`, `liquid`
   particles), level rises inside bottle (stage `filled`), `foam` on top; `filler-pour`.
3. **Capper** (`capper`, 0.9s): cap chute feeds crown caps (a stack visibly decreases and refills),
   press head slams (fast tween + small screen shake via camera spring impulse), `cap-press`.
   Stage `capped`. If `letterMarks.cap`, the glyph appears on the cap.
4. **Labeler** (`labeler`, 1.4s): label roll unwinds (rotating spokes), label strip feeds and wraps
   around bottle (label path grows by arc length), `labeler-wrap`. Stage `labeled` (the glyph is on
   the label when `letterMarks.label`; otherwise a plain band).
5. **Coder** (`coder`, 0.8s): laser coder head, dotted line of `spark` particles writes a dot code
   near the heel, `coder-tick` per dot. Stage `coded`.
6. **Robot arm** (`robotArm`, last station, 0.6s at station + placement arc handled by director):
   3-joint articulated arm (base turret, upper arm, forearm, gripper) whose joints are springs;
   picks the product at the anchor and the director's placement animation is driven by the arm's
   end effector (arm reaches toward the slot, product follows the gripper), `robot-servo`.
   `factories/shared/robotArm.ts` exposes `createRobotArm(ctx, base: Vec3)` with
   `reach(target: Vec3)`, `grip(on)`, `effector(): Vec3` so other factories reuse it and so the
   director can query it (add `placer?: { reach; grip; effector }` to `StationInstance` as an
   optional field; director uses it when present).
7. Conveyors between all 13 stations; raw-material pour at station 1 starts on every keypress.

**Acceptance:** full sand-to-shelf bottle flow for typed text; pipelined jobs; all sounds; tests/build pass.

### Task 8: Destruction FX: shotgun, reject chute, on-line shooting, shatter, close-up vs debris + broom, gap remover

**Files:** `fx/shotgun.ts`, `fx/rejectChute.ts`, `fx/broom.ts`, `fx/gapArm.ts`, `fx/shatter.ts`,
`fx/explodeProduct.ts`, `engine/backspace.ts` (the `BackspaceHandler`), director wiring, tests for
the decision logic (`engine/backspace.test.ts`, pure).

Decision table (binding), target = `shelf.peekLast()`:

| target | condition | action |
| --- | --- | --- |
| newline marker | — | remove newline (no FX) |
| space slot, job in flight | — | remove space job + slot quietly |
| space slot, shelved | — | gap arm slides in, sweeps the gap closed, `whoosh` |
| char slot, job in flight | `inflightBackspace='reject'` | QC pusher at the job's current station/conveyor kicks it into a reject chute running alongside the line; `reject-kick`; product slides down chute into a bin (bin fill grows) |
| char slot, job in flight | `inflightBackspace='shoot'` | shotgun aims at the job's live position, fires; job shatters on the conveyor |
| char slot, shelved | — | shotgun sequence then per `backspaceStyle` |
| debris/dying slot | — | skipped by `peekLast` (target the one before) |

Shotgun sequence (≈1.1s total, sim time not scaled by speedMul): pump shotgun (solid parts: stock,
receiver, barrel, pump) drops in on a spring from above the shelf, rotates to aim at the target
(spring), `shotgun-rack` with the pump sliding back/forward, fires: muzzle flash (`acc-flash`,
`flash` particles), recoil kick (spring impulse), camera shake, `shotgun-blast`, spent shell ejects
(small solid with physics, falls to floor and stays 3s); product shatters with material-specific
particles via `fx/shatter.ts` (bottle: `shard` + `liquid` + `foam`, `glass-shatter` +
`liquid-splash`; can: crumple + spray, `metal-crumple`; mug: ceramic shards, `ceramic-shatter`;
cookie: `crumb`, `crunch`; neon: glass + `spark`, `glass-shatter`; brick: `pellet` pieces,
`plastic-crack`). Rapid repeated backspaces queue shots (the gun stays out and fires again).
After 1.5s idle the gun lifts away.

`backspaceStyle='closeup'`: slot removed right after the shot (shelf slot pops; later slots none since
it's always the last). `'debris'`: slot becomes `debris` (broken stump drawn: jagged base of the
product + puddle ellipse), a small robot broom (`fx/broom.ts`) rolls along the shelf, sweeps
(`broom-sweep`, `smoke` puff), then the slot is removed. Debris slots are skipped by
subsequent backspaces (handled by `peekLast`).

`!` exploding product: after being shelved it shakes for 0.6s, then a foam geyser (`foam` +
`liquid` particles, `explosion-fizz`) and stays as an uncapped product with foam drips.

**Acceptance:** every row of the table works for all products present (bottle + demo); tests for
the pure decision function cover every row.

### Task 9: HUD, gauges, live layout switching, theme and colour modes

**Files:** `hud/Hud.tsx`, `hud/Hud.module.css`, `hud/Gauges.tsx`, `hud/controls/*.tsx` (small
controls: Select, Toggle, Slider, Segmented), `components/Scene.tsx` (mount HUD), `engine/stats.ts`
(units/min, defect rate, line temperature), tests for `engine/stats.ts`.

1. Collapsible panel top-right, Hairline look (thin borders, monospace small caps labels, no
   heavy colour). Toggle button and `H` key? No — letters are for typing. Use `Escape` to toggle HUD
   (Esc never types). Panel sections: Product, Layout, Letter mark (checkboxes: emboss, label,
   cap, shape), Look (colour accent/mono, theme light/dark), Backspace (style closeup/debris,
   in-flight reject/shoot), Camera (overview/follow/cinematic), World (day/night, workers,
   defects + rate slider, idle demo, forklift), Sound (on/off, volume), Share (button: copies URL
   from `lib/share.ts`, shows "copied").
2. Interacting with HUD controls must not type into the factory (input ignores focused form
   elements — Task 2) and must return focus to the page after change (blur) so typing resumes.
3. Gauges bar (bottom-left, always visible, compact): WPM, units/min (shelved in last 60s), defect
   rate (rejected / produced, %), line temperature (°C: furnace/kiln/oven nominal + activity +
   oscillation; per factory nominal: bottle 1500, can 210, mug 1200, cookie 190, neon 1100, brick 230),
   jobs in flight. Analog-dial look drawn in SVG with `hi` needle, digits as plain HUD text (HUD is
   outside the world drawing, so text is fine).
4. Layout switch applies live via `factoryHost.relayout` with camera refit. Theme and colour mode
   switch live (palette refresh for particles).
5. A small typed-text preview strip (current shelf text, monospace, faint) under the gauges.

### Task 10: Extras: day/night, workers, forklift, camera modes polish, defects, idle demo, share replay

**Files:** `fx/dayNight.ts`, `fx/workers.ts`, `fx/forklift.ts`, `engine/defects.ts`,
`engine/idleDemo.ts`, `engine/replay.ts`, director/scene wiring, tests for `defects`, `idleDemo`
scheduling and `replay` (pure parts with fake clock).

1. **Day/night** (`dayNight` setting): 120s real-time cycle. Sky band behind buildings shifts
   (ground plate stays theme colour; draw a horizon band group whose stroke classes swap
   `lo`→`hi` at night for lit windows); building windows light at night (`acc-flash` dots); sun/moon
   disc arcs across the sky. At shift change (dawn and dusk) `factory-bell` and workers swap
   (clock-in animation: workers walk out of a door / in through it). When off: fixed day.
2. **Workers** (`workers` setting): 6–10 tiny stroke figures per factory (hard hat, body, legs that
   swing), walking patrol loops between stations along aisles, stopping to "inspect" (arm raise)
   near busy stations. Never cross machines (paths are aisle polylines from layout bounds).
3. **Forklift** (`forklift` setting): on Enter with forklift on, a forklift drives from the side to
   the top full row, forks lift the row's products (they move together), `forklift-beep` +
   `forklift-motor`, drives off screen; shelf row removed (`row:shipped`). With forklift off,
   Enter is just a newline.
4. **Camera modes**: refine Task 5 modes; cinematic labels nothing (no text), but eases between
   stations with the most activity; `follow` keeps the newest job in the left third.
5. **Defects** (`defects`, `defectRate`): at job creation `job.defect = rng() < defectRate` (seeded
   rng in tests). Inspection rejects → reject chute (Task 8 chute) → automatically re-enqueue a
   replacement job for the same slot (`retries+1`, max 3, replacement never defective at retry 3).
6. **Idle demo** (`idleDemo`): after 20s with no user input, types a random phrase from a list
   (`HELLO WORLD`, `Type me!`, `Glass 2026`, `factory.`, `sand -> soda`) at 4–7 chars/s, waits 8s,
   then backspaces it all (shotgun show), repeats while idle. Any real key cancels it immediately and
   leaves what was produced.
7. **Share replay**: on load with share params, apply settings + product, then type the text
   through the director at 6 chars/s (newlines as Enter).

### Task 11: Can, mug, cookie factories

**Files:** `factories/{can,mug,cookie}/index.ts`, `.../product.ts`, `.../stations/*.ts`, registry.

Each factory has 6–8 stations reusing `factories/shared/parts.ts` and `factories/shared/robotArm.ts`
(robot is always last), a raw-material pour at station 1, distinct building look (Task 12 adds
facades), its own shelf, ambient motion, sounds, particles, letter marks mapped sensibly, specials
(`.` → lid/handle/crumb-sized token per product as appropriate; digits → crate; `!` → exploding/
bursting variant).

- **Can**: coil unwinder (aluminium sheet unrolls, `motor-whir`) → cupper (press punches cups,
  `press-thump`) → draw & iron (cup stretches into tall can body, tween on height) → washer/dryer
  (`steam`) → printer (rotating blanket drum prints a band with the glyph, `acc-label`) → filler
  (`liquid`) → seamer (lid spins and seals, `hiss`) → robot. Label mark = printed band; emboss =
  glyph on lid; cap = glyph on lid; shape = glyph-shaped can outline.
- **Mug**: clay extruder (`press-thump`, clay slug) → potter's wheel (spinning wheel, mug rises
  from slug, clay ridges) → handle attacher (arm presses handle) → kiln (`kiln-roar` loop, glow,
  `acc-molten` interior) → glaze dip (bath, drips) → glaze kiln (short) → robot. Emboss = stamped
  glyph; label = glaze painted glyph; cap = glyph inside the rim; shape = handle shaped as glyph.
- **Cookie**: flour/sugar/butter hoppers → dough mixer (`mixer-churn`) → roller sheeter (dough sheet
  thins) → cutter press (letter-shaped cutter stamps the dough into the glyph outline — the cookie
  is always glyph-shaped here; `press-thump`) → tunnel oven (`oven-hum`, `steam`) → icing nozzle
  (traces the glyph in icing) → robot. Crumbs particles.

### Task 12: Neon and toy-brick factories, building facades, camera pan between buildings

**Files:** `factories/{neon,brick}/...`, `factories/shared/building.ts`, `engine/campus.ts`
(world layout of all six buildings, roads between), scene wiring.

- **Neon**: glass tube rack → gas torch bender (tube heats `acc-molten` and bends stroke by stroke
  into the glyph path, `bend-squeak`, `spark`) → electrode welder (`spark`) → vacuum/bombarder
  (`hiss`, tube flashes) → gas fill (`neon-buzz`) → test light-up (the glyph glows `acc-neon`
  with flicker) → mount on backboard → robot. Product on shelf glows (flicker ambient).
- **Toy brick**: plastic pellet silos (`pellet` particles) → hopper dryer → injection moulding press
  (mould halves close, `injection-thunk`, brick ejected) → stud printer (prints glyph on the top
  studs face) → quality pins → robot. Bright plastic accent uses `acc-label`.
- `factories/shared/building.ts`: each factory sits inside a building shell drawn behind it (back
  walls only, low cut-away front walls, roof trusses as `lo` lines, chimneys, a sign plate with the
  product drawn as an icon — no words), plus a loading dock.
- `engine/campus.ts`: six buildings along +x, roads/rail between; switching product: camera pulls
  out to campus view (0.6s), pans to the building (1.2s), pushes in (0.6s), `whoosh`. Ambient
  machines of non-visible factories are paused (culling).

### Task 13: Performance, reduced motion, accessibility, polish pass

**Files:** as needed; `engine/perf.ts` (dev overlay with `?debug=1`), `README.md`, `CLAUDE.md`.

1. Profile with 40 jobs in flight on bottle factory: target ≥ 55fps on a modern laptop. Apply:
   path-string caching for static solids, skip DOM writes when values unchanged, particle cap
   adaptive to frame time, culling of off-screen stations, `will-change` not used on SVG.
2. Reduced motion: no camera shake, particles 20%, springs land instantly (kernel does), demo off.
3. Accessibility: page title, a visually hidden live region that announces the shelf text
   (debounced), HUD controls keyboard reachable, focus outline visible, `prefers-color-scheme`
   picks the default theme on first load.
4. First-run hint: a faint "start typing" line in the HUD area (HUD text, not in the world) that
   fades after the first key.
5. README: how to run, controls, settings, architecture overview. CLAUDE.md final state.

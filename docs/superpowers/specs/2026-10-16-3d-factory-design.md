# 3D Factory Pivot: design

Date: 2026-10-16 · Branch: `feat/factory-line` · Supersedes the rendering half of `docs/original-plan.md`
and Tasks 5–13 of `docs/plan.md`.

## Why

Task 5 shipped a placeholder: four identical box "stations" whose tops bob, and a cube that carries
its letter from the first frame. The user wants real machinery and wants to watch the product take
shape. Hairline's 2D SVG kernel (outlined extruded prisms) cannot get there. It has no lighting, no
real volumes and no cutaway. The product model also has no notion of raw material becoming a product.

## Decisions (user interview, 2026-10-16)

| Topic | Decision |
| --- | --- |
| Look | One Three.js scene, four switchable looks: realistic, line-art, flat iso, cutaway |
| First products | Cast metal letter, then glass bottle |
| Letter role | Per product: metal and neon *become* the letter; bottle, can and mug *carry* it |
| Pacing | All modes, chosen in the HUD: auto, fast, detailed, cinematic |
| Machines | Procedural geometry in TypeScript, no imported models |
| Old feature list | Keep all; build alongside the first products, not after |
| Target | Desktop / laptop browser |
| Sound | Off by default (done, `d4d6237`) |

## Renderer

- Plain `three` + `@types/three`, with `three/examples/jsm` for `RoundedBoxGeometry`,
  `RoomEnvironment`, `EffectComposer`, `UnrealBloomPass`, `OrbitControls` and `BufferGeometryUtils`.
  No react-three-fiber. The simulation already lives in plain TS classes outside React, and putting
  hundreds of per-frame animated parts through reconciliation buys nothing. React renders only the HUD.
- `engine/renderer.ts` owns the `WebGLRenderer`, the scene, the composer and resize handling. It
  caps the pixel ratio at 2 and sets `localClippingEnabled`.
- **The world is z-up.** Cameras use `up = (0,0,1)`, so `Vec3`, `layout.ts` anchors, particle
  gravity and station math stay unchanged. World units stay as they are now (1 unit ≈ 1 cm).
- One loop: `engine/loop.ts` runs a single `requestAnimationFrame`. Subsystems register
  `update(simDt, realDt, now)`. When nothing is busy and the tab is hidden, the loop sleeps.
  Scene objects never run their own timers.

## Looks (`engine/looks.ts`)

Every mesh is created through `part(geometry, role)`, which tags `userData.role`.

```ts
type MaterialRole = 'steel' | 'paint' | 'paint-accent' | 'rubber' | 'glass' | 'molten' | 'liquid'
  | 'wood' | 'concrete' | 'sand' | 'product' | 'glow';
type Look = 'realistic' | 'lineart' | 'flat' | 'cutaway';
```

A look is a table from role to a shared material, plus a camera kind and a post chain. `setLook(look)`
traverses the scene once and swaps materials. Product meshes own *per-instance* materials (their
temperature and finish animate), so the look supplies a `makeProductMaterial(kind)` factory instead
of a shared instance. Switching look re-creates those materials and copies their animated state.

| Look | Materials | Camera | Post |
| --- | --- | --- | --- |
| realistic | `MeshStandardMaterial`; glass = `MeshPhysicalMaterial` (transmission); `RoomEnvironment` PMREM; ACES tone mapping; one shadow-casting sun | perspective | `UnrealBloomPass` (emissive: molten, glow, sparks) |
| lineart | `MeshBasicMaterial` in the background colour; molten and glow keep their colour | perspective | screen-space edge pass (depth + normal Sobel), which follows morphing geometry for free |
| flat | `MeshToonMaterial` + 3-step gradient map, flat palette per role | orthographic, true iso (elevation 35.26°, azimuth 45°) | none |
| cutaway | realistic materials, `side: DoubleSide`, back faces tinted darker | orthographic side view | global clipping plane through machine mid-depth |

Light and dark theme: the realistic, flat and cutaway looks change background and sun; the line-art
look flips stroke and fill colours.

## Product takes shape

```ts
interface ProductModel { kind: ProductKind; create(job: Job, looks: Looks): ProductHandle }
interface ProductHandle {
  root: THREE.Object3D;                 // moved by the line; drawn once at its own origin
  shape(stage: string, t: number): void; // t = 0..1 progress inside the current station
  dispose(): void;
}
```

Stations call `product.shape(stage, t)` every frame while the product is inside them, so the change
is continuous and never a discrete swap. The previous stage's `t = 1` matches the next stage's `t = 0`.

### Cast metal letter (becomes the letter)

The job rides the line as a **moulding flask**. The letter solid is built from `engine/glyphs.ts`
strokes: one `TubeGeometry` per stroke, radius ≈ 0.09 of the cell height, plus sphere joints and
caps, merged into one geometry. It is built once per character and cached.

| # | Station | Machine | Product change (`stage`, t 0→1) |
| --- | --- | --- | --- |
| 1 | Moulder | sand hopper and ram press; the letter pattern plate presses into the drag half | `flask`: empty flask, sand fills and rams flat, the pattern lifts away, leaving a letter-shaped cavity (dark inset) |
| 2 | Pour | induction furnace beside the line (ingots fed by a side conveyor, ambient), ladle on a gantry tilts and pours | `poured`: molten letter rises inside the cavity bottom-up (clip plane on the letter material), emissive orange-white, glow particles |
| 3 | Cooling tunnel | louvred tunnel with fans and a steam vent | `cooled`: emissive fades orange → red → none; colour goes to dark grey cast iron |
| 4 | Shakeout | vibrating grid; cope and drag split apart | `cast`: flask halves separate, sand falls (sand particles), a rough letter with a sprue stub and flash is revealed |
| 5 | Grinder | robot holds the letter against a spinning wheel | `ground`: sprue and flash shrink to zero, roughness 0.8 → 0.4, spark particles |
| 6 | Polish / plate | buffing wheels and a plating dip tank | `polished`: metalness 0.6 → 1, roughness 0.4 → 0.12; chrome by default (brass via the colour setting) |
| 7 | Robot | shared 6-axis arm | picks the letter and stands it in its shelf slot |

### Glass bottle (carries the letter)

| # | Station | Product change |
| --- | --- | --- |
| 1 | Silos (sand, soda ash, limestone, cullet) | `batch`: a tub fills with four granule layers |
| 2 | Weigh hopper + mixer | the layers blend into one batch colour |
| 3 | Furnace | the tub tips into the furnace mouth (flames, roar); the tub returns empty, and the product is now inside |
| 4 | Gob shear | `gob`: a glowing gob is cut and drops into the trough (morph target 0) |
| 5 | IS machine | `parison` (blank mould closes, morph 0 → 1), invert arm flips it, `bottle-hot` (blow mould, morph 1 → 2); emboss applied here if `letterMark` includes emboss |
| 6 | Annealing lehr | `bottle`: emissive fades, the glass becomes clear transmission |
| 7 | Inspection | scanner ring and flash; reject → chute |
| 8 | Rinser | the bottle inverts, water jets |
| 9 | Rotary filler | `filled`: the inner liquid lathe rises, with foam |
| 10 | Capper | `capped`: the crown descends and crimps |
| 11 | Labeler | `labelled`: a label band wraps around by angle 0 → 2π, glyph printed on it |
| 12 | Laser coder | a dotted line of spark points |
| 13 | Robot | shelf |

The bottle body is one `LatheGeometry` with morph targets gob → parison → bottle (same profile
point count). The label is a cylinder band with a `CanvasTexture`, and the glyph is drawn into the
canvas from `glyphs.ts` strokes. Emboss is a thin `TubeGeometry` along strokes mapped by
`cylinderSurface`.

### Letters in the world
Letters come only from `engine/glyphs.ts` strokes. There is no font loading and no `TextGeometry`.
`engine/surface.ts` gains `glyphStrokes3D(ch, surface, {scale, offset}) → Vec3[][]`; the SVG
`glyphPaths` and the kernel back-face culling are removed. The surface maps (`flat`, `cylinder`,
`top`) are kept as-is.

## Stations and parts

```ts
interface StationCtx {
  group: THREE.Group; origin: Vec3; looks: Looks; particles: ParticleSystem; audio: AudioBus;
  settings: () => Settings; now: () => number;
}
interface StationInstance {
  begin(job: Job, product: ProductHandle | null): void;
  update(dt: number, job: Job | null, t: number, product: ProductHandle | null): void; // also ambient
  finish(job: Job): 'pass' | 'reject';
  destroy(): void;
}
```

`StationDef` keeps `id`, `footprint`, `height`, `duration`, `outputStage` and `create(ctx)`.
Shared kit, `factories/shared/`:
- `parts.ts`: rounded housings, I-beam frames, legs with feet, pipes and elbows, flanges with
  instanced bolts, lathe hoppers and cones, hydraulic piston (cylinder + rod, `set(extension)`),
  gear, pressure gauge with needle, control panel with blinking lamps, hazard-stripe band, guard rails.
- `conveyor.ts`: frame, instanced rollers that spin with belt speed, belt with a scrolling texture.
- `robotArm.ts`: 6-axis arm (base yaw, shoulder, elbow, wrist pitch/roll, gripper) with analytic
  2-bone IK to a target point; `reach(target, t)`, `grip(open)`.

Every station has idle ambient motion: fans, lamps, flames, gauge jitter. A station never sits dead.

## Pacing

`settings.pace: 'auto' | 'fast' | 'detailed' | 'cinematic'`

| Mode | Behaviour |
| --- | --- |
| auto (default) | `Clock.speedMul` from WPM (existing) |
| fast | station durations ×0.35 |
| detailed | durations ×1, speedMul pinned at 1 |
| cinematic | `Line.maxInFlight = 1` (later jobs wait in the queue), camera in follow mode locked on the product |

`Line` gains `maxInFlight` (default ∞).

## Camera (`engine/camera.ts`, rewritten)

The modes stay `overview | follow | cinematic`. Targets are springs on position and look-at, plus an
`OrbitControls` override (dragging orbits; after 4 s idle the camera eases back to its mode).
Orthographic looks use the same targets with a zoom instead of a dolly. `center()` still feeds the
audio listener.

## Particles

The `engine/particles.ts` simulation stays: pooled, world space, gravity on z. Drawing moves to one
`THREE.Points` per blend group (additive: spark, ember, glow, flash; normal: the rest), using a small
shader for size attenuation and per-particle colour. The colour comes from the active look
(`looks.particleColor(kind)`), which replaces `palette.ts`.

## Built alongside (old feature list, in 3D)

- 3D shelf: wooden plank rows with steel brackets. Reuses `shelf/model.ts` (14 columns, wrap,
  newline, busy).
- Backspace: a shotgun drops in, racks, fires (muzzle light flash plus a point light); the product
  shatters into shards and liquid. In-flight backspace uses the reject chute or a shot, per the HUD.
  Debris is swept by the broom or the slot closes up, per the HUD.
- Enter: new row; with the forklift setting, the forklift ships the row.
- Workers (low-poly, hard hats, patrol paths), day/night (sun colour, skylights), defects, idle demo,
  share URL replay: all as specified in `docs/plan.md` Task 10.
- HUD (React): product, look, pace, camera, layout, letter mark, colour, theme, backspace style,
  toggles, sound and volume, quality, gauges, share.
- Later factories: can, mug, cookie, neon (glyph tube that glows, reusing the metal-letter strokes),
  brick, plus the campus pan between buildings.

## Kept, re-targeted, deleted

- **Kept:**
  - engine: `types` (adds `Look`, `Pace`, `Quality`; `ProductKind` adds `letter`), `charset`,
    `settings` (adds `look`, `pace`, `quality`), `clock`, `events`, `line` (+ `maxInFlight`),
    `layout`, `input`, `director`, `glyphs`
  - `shelf/model.ts`, `lib/share.ts` (new keys), `audio/**`
  - particle simulation
- **Re-targeted:** `surface.ts`, `station.ts`, `factory.ts`, `product.ts`, `camera.ts`, `loop.ts`,
  `factoryHost.ts` (the 3D mount; keeps the line, layout and culling logic), `particles.ts` drawing,
  `components/Scene.tsx`, `factories/registry.ts`.
- **Deleted:**
  - `lib/hl.ts`, `lib/hl.node.ts`, `lib/hl.test.ts`, `public/hairline/`
  - kernel `next/script` in `app/layout.tsx`
  - `engine/world.ts`, `engine/productView.ts`, `engine/palette.ts`, `shelf/view.ts`, `factories/demo/`
  - camera viewBox code and its test
- **CLAUDE.md conventions become:**
  - three.js only, z-up
  - meshes via `part(geom, role)`, with no raw materials in stations
  - one rAF loop
  - letters only from `glyphs.ts` strokes
  - sound only via `audio/bus.ts`
  - one station per file
  - moving products are built once at their own origin and moved by transform

## Performance (desktop)

- `InstancedMesh` for rollers, bolts and lamps.
- Static station parts merged per station with `mergeGeometries` (per role).
- One shadow-casting light, shadow box fitted to the active factory.
- `quality: 'low' | 'high'`: low turns off bloom, shadows and the edge pass, and drops the pixel ratio to 1.
- Only the active factory (and any factory in view) ticks.
- `?debug=1` overlay: frame ms, draw calls, triangles.
- Budget: 60 fps with 20 products in flight on an M-series laptop at 1280×800.

## Testing

- vitest (node), for pure logic and geometry builders (three geometry runs without WebGL):
  - bottle morph targets share a vertex count
  - letter-solid stroke tubes stay inside the glyph cell
  - `glyphStrokes3D` matches the surface mapping
  - `Line.maxInFlight` holds
  - pace multipliers
  - look tables cover every `MaterialRole`
  - `shape()` continuity (stage A at t=1 equals stage B at t=0 for scale, emissive and clip)
- Visual: Playwright screenshots at 1280px. Type `HELLO`, capture mid-flight and shelved, once per
  look. Each milestone review checks that the product visibly changes across stations.

## Milestones (each becomes one or more plan tasks)

1. **3D core.** Includes removing Hairline.
   - renderer, looks (all four), loop, camera with orbit, particles drawing
   - parts kit, conveyor, robot arm, 3D shelf
   - factoryHost and director wiring
   - minimal HUD: look, pace, sound
   - end state: products ride a real conveyor to a real shelf
2. **Metal letter factory**, end to end (stations 1–7 above).
3. **Backspace / Enter in 3D**: shotgun, chute, broom, close-up, forklift.
4. **Bottle part 1** (stations 1–7).
5. **Bottle part 2** (8–13).
6. **Full HUD**, gauges, extras (workers, day/night, defects, idle demo), share replay.
7. **Can, mug, cookie.**
8. **Neon, brick**, campus and buildings.
9. **Perf, reduced motion, a11y, polish.**

## Open risks

- Line-art edge pass quality on thin geometry (bolts) can flicker. Mitigation: exclude roles below
  a size threshold from normal edges, or use a thicker depth threshold.
- Glass transmission is expensive with many bottles. Mitigation: shelf bottles switch to a cheaper
  `MeshStandard` glass approximation in `quality: low`.
- Cutaway without stencil caps shows hollow walls. Accepted: back faces are tinted to read as
  section cuts.

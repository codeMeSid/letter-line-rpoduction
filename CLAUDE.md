# CLAUDE.md — Letter Factory Line

Read this first in every new session.

## What this is

A full-page Next.js app: every typed character runs an animated 3D factory (Three.js, four looks:
realistic, line-art, flat iso, cutaway) whose real procedural machines visibly turn raw material into
a product that is or bears that character, then shelve it like a typewriter. Space = empty slot, Backspace = remove the
last slot (landed: shotgun for shelved products, reject hoist and chute, shelf broom), Enter = new row (landed: the dock forklift ships the
oldest row once more than three are shelved). Product factories: cast metal letter and glass bottle landed; cookie, donut, mug, can, toy car are construction-site plots (later plans).
They stand on a campus (picker to fly between factories, construction sites for later ones); each built factory sits in a building with workers
patrolling it and an optional day/night cycle. Procedural sound (default off), collapsible HUD.
**User bar:** real machinery, the product visibly taking shape — never placeholder boxes.

## Where things are

- `docs/superpowers/specs/2026-10-17-campus-foundation-design.md` — campus, buildings, backspace/forklift fx, workers, day/night (binding, current).
- `docs/superpowers/plans/2026-10-17-campus-foundation.md` — current executable plan (Global Constraints, Tasks 13–18). Binding.
- `docs/superpowers/specs/2026-10-16-3d-factory-design.md` — the 3D pivot design (binding; campus spec builds on it).
- `docs/superpowers/plans/2026-10-16-3d-core-metal-letter.md` — earlier plan: Global Constraints, Tasks 5–12 (3D core + metal letter). Landed.
- `docs/plan.md` — original plan; Tasks 1–4 history, Tasks 5–13 superseded by the 3D pivot.
- `docs/original-plan.md` — the first high-level plan + the user's Q&A choices (rendering parts superseded).
- `docs/PROGRESS.md` — task status, rulings (decisions made on the user's behalf), deferred findings.
  **Resume from the first task not marked complete.**
- `.superpowers/sdd/<plan-slug>/` (git-ignored) — subagent-driven-development scratch: task briefs,
  implementer reports, review packages, and `progress.md` (the SDD ledger, mirrors `docs/PROGRESS.md`).

## How to resume after a lost session

1. `git log --oneline` and read `docs/PROGRESS.md`. Trust those over memory.
2. Continue with the subagent-driven-development workflow: per task, brief → implementer →
   task review → fix loop (max 5) → mark complete in `docs/PROGRESS.md` (+ SDD ledger).
3. Branch: `feat/factory-line` (work never happens on `main`).

## Commands

- `pnpm dev` — dev server (http://localhost:3000; `/dev/bench` 3D parts/looks bench, `/dev/sound` sound audition)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — `vitest run`
- `pnpm build` — `next build`
All three of typecheck/test/build must pass before every commit.
Tooling: pnpm, Node 25, Next 15.5 + React 19, TypeScript 5.9 (pinned `typescript@5`; Next 15 needs the JS
compiler API), vitest 5 (node env; `vitest.config.ts` loads as ESM via `"type": "module"`).
`app/` and `components/` may import with `@/`; everything under `engine/ factories/ shelf/ audio/ lib/ hud/ fx/`
uses relative imports (vitest has no alias).

## Non-negotiable conventions (full list: Global Constraints in the current plan)

- Three.js (`three@0.186.1`), imperative, outside React. **World z-up**; viewer stands at −y so +x reads
  left→right; shelf in front of the line.
- Meshes only via `looks.part(geom, role)` (or `new Mesh(geom, looks.own(role))` for animated per-instance
  materials). No `new *Material` outside `engine/looks.ts` (shader exceptions: `edgePass.ts`, `particlesView.ts`).
- One rAF loop (`engine/loop.ts`). No own rAF/setInterval/CSS animation for scene objects.
- Letters only from `engine/glyphs.ts` strokes (`letterGeometry`). No fonts/TextGeometry.
- Sound only via `audio/bus.ts`; default off. Particles only while a station processes a non-space job, plus user-triggered fx (shot, shatter, sweep); nothing ambient (no chimney smoke, no idle dust).
- Station local frame: z=0 = belt top (`BELT_TOP` 22), floor at z=−22. Products: built once at own origin,
  `shape(stage, t)` continuous across stages.
- One responsibility per file; each station its own file.

## Architecture (fills in as tasks land)

- `lib/` — `share.ts` (`encodeShare`/`decodeShare`: `p`, `t`, `s` query params; invalid → null). No kernel/SVG runtime any more.
- `app/` — `layout.tsx` (no scripts), `page.tsx` (client component, `dynamic(..., { ssr:false })` → Scene),
  `globals.css` (reset, `.stage` full-viewport canvas host, `.hud*` panel, `.bench-*` overlay), `dev/bench` (→ `components/Bench.tsx`: a swatch per material role, look/theme/quality buttons, spark+sand emitter; add `ROWS` entries) + `dev/sound` (both 404 in production)
- `engine/` — pure & unit-tested (no DOM): `types`, `charset`, `settings` (zustand store + `useSettings`), `clock` (WPM/speedMul),
  `events` (typed emitter), `layout` (`layoutStations`: anchors/paths per mode, footprints centred on anchors),
  `line` (`Line` pipeline; `decide` injected; jobs leave as `placing`/`rejected`; phase callbacks flush after each tick; `remove()` → `destroyed`; hand-offs keep `minGap`: a belt head stops short of a busy station or the job that just left it, and a station takes a job only once its outbound tail is `minGap` away; jobs leaving as `placing` this tick still count against `maxInFlight`), `input` (`keyToCommand`; `keyRoute(key, hudOpen, target)` → hud | block | control | factory),
  `station`/`product`/`factory` (Task 9 contracts: StationCtx/Def/Instance, ProductHandle/Model, FactoryDef),
  `glyphs` (`GLYPHS`/`glyph(ch)`: single-stroke set, cell u 0..0.7 × v 0..1 v-down, caps/digits 0..0.8, x-line .25, baseline .8, descender 1; unknown → `?`),
  `surface` (`flatSurface`/`cylinderSurface`/`topSurface` map normalised cell (u,v) → world Vec3, `FRONT_ANGLE` = −y; no SVG/culling; surface u 0..1 ↔ glyph u 0..0.7),
  `particles` (pure sim; buffers public read-only, `specOf(kindIndex)`, `ColorKey`).
  Three runtime (Task 6): `looks` (`Looks`: role → shared material per look; `own(role)` for per-instance; `apply`/`appearance`; background/edge/particle colours; belt texture; cutaway clips per object: meshes with `userData.cut` get `material(role, true)` = clipped by `looks.cutPlane` (`clipShadows` on), the host tags station + conveyor meshes only, `own()` materials are not clipped),
  `renderer` (`createRenderer(root, quality)`: one WebGL canvas), `stage` (`createStage`: lights, env map, tone mapping per look, `fitShadow`),
  `loop` (`createLoop(speedMul, env?)`: the single rAF; dt clamped to `MAX_DT`, sleeps when hidden/idle, `wake()`),
  `particlesView` (`ParticlesView`: normal + additive `THREE.Points` on `PARTICLE_LAYER`; the camera must enable that layer),
  `camera` (`CameraRig`: persp for realistic/line-art, ortho for flat/cutaway; overview/follow/cinematic; OrbitControls yields 4 s after the user; rig target handed to the controls on 'start' only, so pans stick; polar angle < π/2, dolly 60..10000, ortho half-height 30..4000), `post` (`createPost`: composer chain per look/quality) + `edgePass`,
  `director` (`Director`: routes commands, owns one `Shelf` per kind, events; placing jobs count against the pace's `maxInFlight`) + `pace`,
  `factoryHost` (`FactoryHost(def, origin, deps, mode)`: mounts one `FactoryDef` — floor, conveyors, stations, `Line`, one `ProductHandle` per in-flight job (queued = hidden, backspaced = disposed), `relayout(mode)`/`restyle()`; `newest()` = newest non-queued line job, the placing job only when the line is empty; shelved handles are handed to `ShelfView`)
- `shelf/` — `model.ts` pure `Shelf` (lazy auto-wrap at 14, per-row `endedByNewline`, `removeNewline`; `peekLast` → slot | newline | busy | null)
  + `view.ts` `ShelfView` (R24: flat tray in front of the line, `SHELF_FRONT` 220; every row has its own plank group keyed by the model's row array (damped y), newest = front plank,
  older rows glide back +y on the same level toward the robot rail behind; `slotPos`/`span`/`adopt`/`bounds`; owns shelved handles, damps them to their slot, disposes on removal;
  forklift hand-over: `releaseRow(row)` → `{group, handles}` (plank + products, undisposed), `rowEnd(row)` = the plank's +x end at its top)
- `audio/` — `types` (binding `SOUND_NAMES`/`SoundName`, `LOOP_NAMES`, `AudioProvider`, `LoopHandle`, `VoiceHandle`),
  `bus` (`AudioBus`: lazy ctx on `unlock()`, `setVolume`/`setEnabled` (master = volume², 0 when off; mute stops loop sources and
  restarts them on unmute), `setListener(xCenter, halfWidth)` +
  `play(name, {x|pan, gain, rate})`, per-name throttle 40ms (key-clack 15), 24-voice cap drops oldest (sources actually `stop()`),
  loops queued until unlock; takes no settings import — `components/Scene.tsx` feeds it `volume`/`sound` from the store), `synth/` (active procedural provider `SynthProvider`;
  `voice.ts` = Voice helper; sources are not pre-stopped so cap/halt can `src.stop()` once, then the whole graph disconnects;
  `tone()`/`burst()`/raw oscillators+noise; one file per sound family; `loops.ts`; `noise.ts` crossfaded seamless noise buffers),
  `samples.ts` (`SampleProvider` stub, empty `SAMPLE_URLS`), `fakeContext.ts` (fake Web Audio for node tests only).
  Dev aid: `/dev/sound` page (hidden, 404 in production) auditions every sound/loop and has an offline-render level check.
  Providers' `play` returns a `VoiceHandle` so the bus can count/stop voices.
- `factories/` — one folder per product + `shared/`: `dims` (`BELT_TOP`, `BELT_W`), `ik`, `parts` (`housing`/`box`/`column`/`beam`/`pipe`/`lathe`
  + `flange`/`piston`/`gear`/`gauge`/`lamp`/`panel`/`hazardBand`/`railing`/`legs`; z-up, bottom at z=0, centred on x/y; `merged`, `disposeTree`),
  `conveyor` (`buildConveyor(looks, path, opts)` → `{group, update(simDt, speed), dispose()}`; belt scroll itself is `Looks.scrollBelts`),
  `robotArm` (`RobotArm`: `reach`/`grip`/`tip`/`dispose`). Bench views: `/dev/bench` buttons `view: swatches|line|machine|detail|letter`.
  `letter/`: `visual.ts` (pure `letterVisual(stage, t)`, `LETTER_STAGES`) + `product.ts` (`letterProduct`: flask/sand/cavity/molten metal clipped by a world fill plane,
  sprue + flash (flash is only attached to the `letter` group while shown), `place()` stands it upright; `PALLET_T`, `SAND_TOP`, `LETTER_H/R`). `view: letter` has a stage scrubber + char box.
  `letter/stations/`: one file per station (`moulder`, `pour`, `cooling`, `shakeout`, `grinder`, `polish`, `robot` = rail robot that places onto the shelf) + `common.ts` (`FLOOR`, `ss`, `ease`, `stationBase`,
  `helix`, `world`/`floorZ` for world-space particles, `teardown(group, keep)`, `oneShots()`) + `testkit.ts` (tests only). Stations build every mesh
  in `create()` with `looks.part`/parts kit (R16: never `own()`); later frames only move/show/swap geometry. `view: stations|moulder|pour|cooling|shakeout`
  runs each station on a looping fake job with a freeze-at-t slider; those views cut per object like the real Scene.
- `engine/` also (campus plan): `campus` (pure plot/flight layout), `backspace` (pure backspace decision), `dayNight` (`skyAtTime`/`Sky`/`SUN_NOON`: 120 s day, 60% daylight, noon start; off = noon),
  `patrol` (`patrolLoop`/`sampleLoop`/`loopLength`: closed rectangle walk), `stage.setSky(sky, looks)` (scales the sun/hemisphere of the look, tints/moves the sun, dims the background; `lineart` keeps its paper).
  `Director`: a *pending* backspace waits for a busy newline row and typing cancels it; only the active product's factory advances (others freeze, resume); `shipRow(kind)` removes the oldest row once the forklift lifts it.
  `Shelf.readyToShip()` (more than `SHELF_ROWS` = 3 rows), `shipRow()`.
- `shelf/view.ts` also: per-row plank groups (`ROW_PITCH` 32, levels 0..3, deeper rows stack in tiers of 40 above level 3 so they never reach the robot rail), `releaseRow(row)` (forklift takes the plank + products), `release(slotId)` (shotgun takes one product), `rowEnd(row)`, `productHeight`.
- `factories/bottle/`: `visual.ts` (pure, `BOTTLE_STAGES` = tub, batch, mixed, melted, gob, parison, bottle-hot, bottle, filled, capped, labelled) + `product.ts` (`bottleProduct`: lathe bottle with gob/parison morph targets on the finished-bottle base, batch tub with granule layers, liquid + foam, crown, partial-cylinder label with bent `letterGeometry` glyph, emboss; `PUCK_T`) + `stations/` one file each: `silos`, `mixer`, `furnace`, `gobShear`, `isMachine`, `lehr`, `inspection` (rejects only on `job.defect`), `rinser`, `filler`, `capper`, `labeler`, `coder`, `robot`. No bench views yet.
- `factories/shared/stationKit.ts` (was `letter/stations/common.ts`, which now re-exports it) + `shared/railRobot.ts` (`railRobot(id, beltTip, shelfTip)`: rail robot placing onto the shelf; both factories' `robot` wrap it).
- `factories/registry.ts` — `FACTORIES`, `factoryOrigin`, `PLOTS` (campus plots; unbuilt kinds are construction sites).
- `factories/shared/building.ts` (`buildBuilding(looks, floorBox, height)`: shell, sloped side walls, +x dock door with 110 lintel, chute/bin anchors, `setNight` windows and lamps, sign anchor) + `factories/shared/figure.ts` (`figure(looks)` low-poly worker: `pose(walk, arm, seated?)`).
- `fx/` — `ground` (campus ground), `construction` (`ConstructionSite`, `setNight`), `site` (`FactorySite`: building + sign + hoist, broom, forklift, workers per built factory; created once, `rebuild()` after relayout, `update(realDt, night)`),
  `fragments` + `shotgun` (backspace on a shelved product: shot + shatter), `destroyer` (the shared shotgun/fragments owner), `hoist` (reject lift + chute), `broom` (sweeps a gap/space slot),
  `forklift` (never turns: forks face the shelf, reverses out and through the dock door; `fetch(target, onLift, clearTop)`), `workers` (6 figures walking the loop around the factory, two reversed, stopping ~every 6-12 s for 2 s to face the line with an arm raised),
  `testkit` (tests only). fx run on real time (`realDt`), only the active factory's site updates.
- `hud/` — `Hud.tsx` minimal settings panel (product/look/pace/camera/theme/quality, Day / night and Workers toggles, sound; Escape or gear toggles; Tab moves between controls only while open; styles `.hud*` in `globals.css`). Gauges later
- `components/Scene.tsx` — client entry: renderer, looks, stage, post, rig, one `FactoryHost` per registered kind (`factories/registry.ts`: `FACTORIES`, `factoryOrigin`), director, the single loop, key routing (`keyRoute`; a HUD control is blurred when printable typing goes to the factory), settings subscription (`applyLook` = `looks.set` then `looks.apply(scene)` + host restyle; cutaway forces `pan` layout + clip plane)

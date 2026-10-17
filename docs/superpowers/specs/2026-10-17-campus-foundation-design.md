# Campus Foundation + Shared Extras: Design

Status: approved in chat (2026-10-17). This is sub-project 1 of the multi-product roadmap. It builds on
`docs/superpowers/specs/2026-10-16-3d-factory-design.md` (still binding for everything it does not change).

## Intent

The user wants several product factories, not just the cast metal letter: glass bottle, cookie, donut,
pottery mug, can and toy car. **One factory is active at a time.** The user picks it in the HUD, and the
camera flies across a campus of buildings to that factory. Each factory has its own shelf.

The shared extras get built once here, before the second factory, so every later factory plugs into them:
- shotgun backspace with per-product shatter
- reject chute
- debris + broom
- forklift row shipping
- workers
- day/night

**User bar (unchanged):** real machinery and real-looking scenery, never placeholder boxes. All four looks
(realistic, line-art, flat iso, cutaway) must read well.

**Success:**
1. Switching product pulls the camera out, pans and pushes in, correctly in all four looks.
2. Backspace runs the right scene for each case: shotgun on the shelf, reject crane on the line, shotgun on
   the line, broom for debris and gaps.
3. A fourth shelf row makes the forklift haul the oldest row away smoothly.
4. 60 fps holds with one active factory and 20 products in flight (M-series laptop, 1280×800).

**Out of scope:**
- the new factories themselves (each gets its own spec → plan → build, in the order bottle → cookie →
  donut → mug → can → toy car)
- defects, idle demo, share replay, gauges
- the `!` exploding product
- worker shift-change animation

## Product kinds

`ProductKind = 'letter' | 'bottle' | 'cookie' | 'donut' | 'mug' | 'can' | 'car'`, in this order. That is
the campus order and the build order. `neon` and `brick` are dropped; the user replaced them with donut and
toy car.

Letter roles of the future factories:
| Factory | How it carries the letter |
|---|---|
| bottle | emboss + label |
| cookie | letter-shaped cutter + icing |
| donut | an icing nozzle writes the letter |
| mug | glaze-painted letter |
| can | printed band |
| car | normal toy car with a letter decal / number plate |

## Campus (`engine/campus.ts`, `factories/shared/building.ts`, `fx/construction.ts`)

**Plots.** Plots sit side by side along +x in `PRODUCT_KINDS` order, with a 160-wide road between
neighbours and a main road along the front (−y).
- A built factory's plot is the **widest layout it can take over all four layout modes**, so its origin
  never moves when the layout changes. Plot width = max(layout width, shelf width), plus 70 pad on the left
  and 260 on the right (the forklift dock).
- An unbuilt factory gets a 900 × 700 plot.
- `campusLayout` is pure. It takes plot sizes and returns plot x-ranges and factory origins.

**Building shell.** Each built factory sits in a "dollhouse cutaway" building, rebuilt to the current
layout's floor box whenever the layout changes. The building has **no roof**, because a roof would hide the
line from every camera.
- **Back wall:** full height, at least 320 and at least the tallest station + 160. It carries clerestory
  windows (glass by day, glow at night), wall lamps, and a sign board with the factory's own finished
  product at 3× scale (no words, no icon art).
- **Reject chute + bin:** stand against the back wall.
- **Side walls:** slope from full height at the back down to a 24-high knee wall at the front.
- **Front:** a 24-high knee wall.
- **Columns:** at the corners and every ~160 along the walls.
- **Loading dock:** on the +x side near the front. It is a framed door opening with a lintel at 70, a
  roll-up shutter box, and a ramp outside.
- **Cutaway:** all building meshes are tagged `userData.cut`, so the cutaway look slices the front walls
  away.
- **Ground:** a campus slab of concrete with rubber roads and paint-accent lane dashes.

**Construction sites.** These stand on unbuilt plots and are real site scenery, not product placeholders:
- concrete slab with rebar stubs
- perimeter fence (posts and rails)
- tower crane: lattice mast from beams, a jib and counter-jib, a trolley and a hook. It slews slowly as its
  only ambient motion.
- site cabin and a stacked I-beam pile
- hazard-striped sign board

**Paused factories.** Only the active factory runs: the director ticks only its line and placing arcs, and
only its host, site and workers update. Other factories stay visible but frozen, and three's frustum culling
keeps their draw cost down.

## Product picker + camera flight

**Picker.** The HUD gets a Product select listing every kind.
- Unbuilt kinds are disabled and labelled "(coming soon)".
- In development builds, unbuilt kinds can be selected, so the flight can be checked. The camera flies to
  the construction site and typing there does nothing.

**Flight.** When `settings.product` changes, `CameraRig.fly()` starts a 2.4 s flight in three phases:
| Phase | Share | Target | Extent |
|---|---|---|---|
| 1. pull out | 25% | stays on A | A → wide |
| 2. pan | 50% | A → B | wide |
| 3. push in | 25% | stays on B | wide → B |
- Each phase is smoothstepped.
- *wide* = max(1.25 × max(A, B), fit of the union of both boxes).
- B is read live, so it is the new factory's overview.
- The view direction stays the look's direction.
- A user orbit drag cancels the flight.
- A product change mid-flight starts a new flight from the current pose.
- Sound: `whoosh`.
- The pure `flightPose(u, a, b, wide)` holds the maths.

## Backspace (`engine/backspace.ts` pure plan, `fx/destroyer.ts` executes)

`planBackspace(target, job, inflightBackspace)`:

| target | condition | plan |
|---|---|---|
| newline marker | — | `newline`: remove the newline, no fx |
| slot, job queued (never seen) or space still in flight | — | `quiet`: remove job + slot, no fx |
| space slot, filled | — | `gap`: broom taps the gap, then the slot is removed |
| char slot, job on the line or at a station | `reject` | `reject`: hoist claw lifts it to the reject chute |
| char slot, job on the line/station (`shoot`) or placing (always) | — | `shoot-line`: shotgun shoots it where it is |
| char slot, filled | — | `shoot-shelf`: shotgun, then close up or leave debris |

**Busy target.** When `peekLast()` answers busy (a newline would be crossed while dying/debris slots
remain), the director counts a pending backspace and retries on the next `slot:removed`. Any typed
char/space/enter clears the pending count.

**Slot lifecycle.**
- In-flight plans (`quiet`, `reject`, `shoot-line`) remove the slot at once. The fx run on the released
  product handle.
- `shoot-shelf` marks the slot `dying` at once, so the next backspace targets the slot before it and the
  text omits it. After the hit:
  - `closeup`: remove the slot.
  - `debris`: mark the slot `debris` and leave a fragment pile (plus a puddle when the product's style asks
    for one), then the broom sweeps it and the slot is removed.

**Handle hand-off.** `FactoryHost.release(jobId)` and `ShelfView.release(slotId)` give a product handle to
the fx without disposing it. The fx disposes it when done.

**Shotgun (`fx/shotgun.ts`).** One shared gun in world space, about 48 long (stock and pump in wood;
receiver, barrel and magazine tube in steel). It hangs from a steel rod that runs up out of frame.
- **Sequence (real time):**
  1. drop in to target + (−60, −35, +45) and aim (0.35 s)
  2. pump back and forward with `shotgun-rack` (0.25 s)
  3. fire: muzzle `flash` + `spark` particles, a 0.12 s pulse of the scene's single always-present point
     light (intensity 0 at rest, so no shader recompiles), recoil, a camera shake, `shotgun-blast`
  4. hit 0.05 s later
- **Shell:** a spent shell ejects (paint-accent hull, copper head), bounces on the floor and is removed
  after 3 s.
- **Queueing:** repeated backspaces queue shots, and the gun moves between targets. After 1.5 s idle it
  lifts away.

**Shatter.** Each `ProductModel` gains a required `shatter: ShatterStyle`:
```ts
interface ShatterStyle {
  burst: { kind: ParticleKind; count: number }[];   // world particles at the hit
  sounds: SoundName[];
  fragments: { role: MaterialRole; count: number; size: number }; // flying chunks; also the debris pile
  puddle?: boolean;                                  // debris mode leaves a liquid disc
}
```
- **Fragments (`fx/fragments.ts`):** one pooled `InstancedMesh` per role (capacity 128, role-tagged so
  looks swap it). Chunks fly with gravity, spin and bounce, live 2.5 s and shrink over the last 0.4 s.
- **Letter style:** sparks 36 + smoke 6, `metal-crumple`, 9 steel fragments of size 3.2, no puddle.

**Reject hoist (`fx/hoist.ts`, per factory).** A claw on a cable that runs up out of frame, the same idea
as the shotgun rod.
- **Sequence:**
  1. travel above the product (0.5 s)
  2. lower to it (0.3 s)
  3. grip, with `reject-kick` (0.1 s)
  4. lift (0.3 s)
  5. travel above the chute top at the back wall (0.6 s)
  6. release: the product falls into the chute, slides down (0.6 s) and lands in the bin
- **Bin:** keeps the last 6 rejected products, tilted. Older ones are disposed.
- **Clipping:** where a station has a roof, the claw clips through it briefly. This is accepted (ponytail).

**Broom robot (`fx/broom.ts`, per factory).** A small rover with a spinning brush roller and a beacon lamp.
- It parks at the +x end of the front plank.
- **Debris:** it drives along the plank top to the slot (on that slot's row), sweeps for 0.8 s
  (`broom-sweep`, smoke puff), the pile shrinks away and the slot is removed. Then it returns.
- **Gap:** the same trip with a 0.3 s tap and `whoosh`.
- Jobs queue in order.

## Forklift row shipping (`fx/forklift.ts`, per factory)

This replaces the hidden-old-rows window (`VISIBLE_ROWS`).
- **Shelf rows:** the shelf keeps `SHELF_ROWS = 3` rows. The tray draws every row.
- **When it ships:** once there are more than 3 rows and every slot of row 0 (the oldest, back-most) is
  `filled`, the forklift fetches that row. Waiting for every slot to fill means no in-flight job is ever
  stranded.
- **Enter:** stays a plain, reversible newline. The `forklift` setting is removed.
- **Model:**
  - painted body
  - steel mast with a carriage that lifts on the mast
  - long "lumber" forks (90)
  - rubber wheels, seat, overhead guard and counterweight
  - a seated worker figure driving
  - beacon lamp
- **Sequence** (real time × (1 + rows waiting), so it catches up with fast typing):
  1. leave the dock parking spot and drive to the +x end of the oldest plank, with `forklift-motor` (~2 s)
  2. insert the forks along x under the plank end (0.5 s)
  3. lift (0.5 s). At lift, `ShelfView.releaseRow(row)` hands over the plank group + its product handles and
     `director.shipRow(kind)` updates the model and emits `row:shipped`.
  4. reverse out with `forklift-beep` (0.8 s)
  5. drive out through the dock door, where the load is disposed (~2 s)
  6. return empty to park
- **Plank motion:** planks are drawn per row and damped to their row level like the products, so older rows
  glide back when a row is added instead of jumping.

## Workers + day/night

**Workers (`fx/workers.ts`, `factories/shared/figure.ts`, pure `engine/patrol.ts`).**
- **Figure:** low-poly, about 42 tall: paint-accent hard hat, copper (orange) hi-vis vest, paint (blue)
  work clothes, rubber boots, sand-toned head and hands. Arms and legs swing in a walk cycle with a slight
  bob.
- **Patrol:** 6 per factory on a closed loop around the station bounds, inflated by 45 so they clear belt
  edges and the U-turns. That loop passes between the line and the robot rail. Workers are spread evenly;
  two walk the other way. Speed is 30/s, facing travel.
- **Inspection:** every 6–12 s a worker stops for 2 s, faces the line and raises an arm.
- **Toggle:** `settings.workers` hides them.

**Day/night (`engine/dayNight.ts` pure, `Stage.setSky`).**
- **Cycle:** 120 s of real time; 60% day, 40% night. It starts at noon, and noon equals today's lighting
  exactly (sun dir `(-0.45,-0.6,1)`, colour 0xfff4e6, intensity scale 1).
- **Day:** the sun sweeps from left (morning) through front (noon) to right (evening), low at dawn and dusk.
- **Night:** a dim bluish moon, the same directional light at 0.25 scale.
- **Background:** darkens toward night navy in the lit looks and flat. Line-art ignores lighting.
- **Building lights:** windows swap glass → glow and wall lamps turn on when night > 0.5.
- **Bell:** `factory-bell` at dawn.
- **Shadows:** the shadow box follows the sun direction.
- **Toggle:** `settings.dayNight` off = fixed noon.

## HUD

Added:
- Product (picker)
- Backspace style (close-up / debris + broom)
- In-flight backspace (reject chute / shoot)
- Day/night
- Workers

Removed: nothing visible. The `forklift` setting leaves `Settings` and `lib/share.ts`.

## Architecture summary

**Pure (node-tested):**
- `engine/campus.ts`: `campusLayout`, `flightPose`
- `engine/backspace.ts`: `planBackspace`
- `engine/dayNight.ts`: `skyAt`, `skyAtTime`
- `engine/patrol.ts`: `patrolLoop`, `sampleLoop`
- `Director` changes: active-only tick, pending backspace, `shipRow`
- `Shelf.readyToShip`

**Scene objects:**
- `factories/shared/building.ts` + `figure.ts`
- `fx/construction.ts`, `fx/site.ts` (`FactorySite` per built factory: building, hoist, bin, broom,
  forklift, workers)
- `fx/shotgun.ts`, `fx/fragments.ts`, `fx/destroyer.ts` (the `BackspaceHandler`)
- `CameraRig.fly/shake`, `Stage.setSky`/flash light

**Ownership and wiring:**
- `FactorySite` is rebuilt after `FactoryHost.relayout`.
- `Scene` owns the campus ground, the sites, the construction sites and the destroyer.
- Conventions stay: roles only, one rAF loop, sound only via the bus, z-up, viewer at −y.
- **Particles:** an fx event (shot, sweep, shatter) may emit particles. This extends the station-only rule
  to *user-triggered* fx. There are still no ambient particles.

## Testing

**Unit (vitest, node):**
- `campusLayout` (plot order, gaps, origins stable across modes)
- `flightPose` (endpoints, continuity, wide at mid-pan)
- `planBackspace` (every table row)
- director pending backspace + active-only tick + `shipRow`
- `Shelf.readyToShip`
- `skyAt` (noon = current lighting, wrap continuity, night)
- `patrolLoop` / `sampleLoop` (closed loop, clearance)
- **fx sequences with fake deps:**
  - shotgun: hit once per shot, queue, lift after idle
  - hoist and broom: callbacks once, in order
  - forklift: releases the row at lift, disposes the load at the dock
  - `ShelfView.release` / `releaseRow`, `FactoryHost.release`

**Visual (controller, Playwright, 1280×800, every look):**
- campus flight letter ↔ a construction site (dev)
- shelf shot in close-up and debris modes
- in-flight reject and shoot
- forklift shipping a row
- workers walking
- a night frame

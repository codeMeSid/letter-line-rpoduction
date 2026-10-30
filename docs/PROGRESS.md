# Progress, rulings and deferred findings

Plan: `docs/superpowers/plans/2026-10-16-3d-core-metal-letter.md` (Tasks 5–12, 3D pivot; spec
`docs/superpowers/specs/2026-10-16-3d-factory-design.md`). `docs/plan.md` Tasks 1–4 stay valid history;
its Tasks 5–13 are superseded. Controller-owned file (implementers do not edit it).

## Task status

| Task | Title | Status | Commits |
| --- | --- | --- | --- |
| 1 | Scaffold + kernel + wrapper | complete (1 fix round) | 18c7d44..4b86567 |
| 2 | Core pure logic | complete (1 fix round) | 1df5281..ca6974d |
| 3 | Glyphs + surfaces | complete | b703d52..8810fe9 |
| 4 | Audio bus + synth | complete | b12795e..392b05b |
| 5 (old) | SVG runtime + demo line | superseded (snapshot b36476b) | b36476b |
| 5 | Pure groundwork (pace, line opts, −y layout, letter solid, IK) | complete (1 fix round) | 7ba3876..027d297 |
| 6 | Three runtime swap (renderer, stage, looks, loop, particles, bench) | complete (1 fix round) | 681ad8d..65a5b2c |
| 7 | Post-processing + camera rig | complete (1 fix round) | 65a5b2c..e58710d |
| 8 | Parts kit, conveyor, robot arm | complete (1 fix round) | e58710d..a76afe3 |
| 9 | 3D contracts, factory host, shelf, scene, minimal HUD | complete (1 fix round) | a76afe3..36b5584 |
| 10 | Cast metal letter product | complete (2 fix rounds) | 36b5584..e6b5c8e |
| 11 | Letter stations 1–4 | complete (1 fix round) | e6b5c8e..781b9ac |
| 12 | Letter stations 5–7, registry, end-to-end | complete (2 fix rounds) | 781b9ac..1833d11 |
| Final | Whole-branch review (Tasks 5–12) | done in final fix wave | |
| 13 | Campus pure groundwork (kinds, campus, backspace plan, sky, patrol, director) | complete | ef2511d..d2d418e |
| 14 | Campus scene: buildings, construction sites, flight, picker | complete (1 fix round) | d2d418e..e2b2ad0 |
| 15 | Shotgun, fragments, destroyer | complete (1 fix round) | e2b2ad0..6a458fb |
| 16 | Reject hoist, debris broom, gap, HUD options | complete (1 fix round) | 6a458fb..37f20ed |
| 17 | Forklift row shipping, per-row planks, figure | complete (1 fix round) | 37f20ed..700a9bd |
| 18 | Workers, day/night, HUD toggles, docs | complete | 700a9bd..66e929d |
| Final | Whole-branch review (Tasks 13–18) | complete (1 fix pass) | 66e929d..3b98fe2 |
| 19 | Glass bottle factory (product, 13 stations, shared stationKit/railRobot, registry) | complete (Opus review APPROVE, 2 nits fixed; flat iso + cutaway visual check, realistic look not checked; no bench views) | uncommitted |
| 20–24 | Cookie (11), donut (11), mug (11), can (12), toy car (12) factories + registry wiring | built, unreviewed; gates green (typecheck, 961 tests, build); NOT visually checked, no Opus review; cookie/donut/car glyph ignores letterMarks; can robot grip heights 25/25 guessed |

Campus plan (Tasks 13–18): `docs/superpowers/plans/2026-10-17-campus-foundation.md`, spec
`docs/superpowers/specs/2026-10-17-campus-foundation-design.md`, ledger `.superpowers/sdd/2026-10-17-campus-foundation/progress.md`.
Key rulings: overview frames machines+shelf (not the building); no camera shake during user orbit hold; placing-arc shots
fall to the floor; forklift never turns (reverse out the dock, carriage raised over rows, lowered for the 110 lintel,
telescoping mast); shelf ROW_PITCH 32, overflow rows > 4 stack upward in tiers clear of the robot rail. Next: bottle factory spec.

## Rulings (decisions made on the user's behalf)

Format: `Ruling: <what> — <why> — <cost if wrong>`

- Ruling: Expanded the approved high-level plan into `docs/plan.md` with 13 tasks and binding interfaces — SDD needs per-task briefs and shared interfaces so sequential implementers stay compatible — rework of interface names if the user wanted a different split.
- Ruling: Next.js App Router (user said "next js also works") instead of a single self-contained HTML file — user preference for easy deploy — no single-file export (could add `output: 'export'` later).
- Ruling: Each factory has its own shelf (switching product shows that factory's shelf/text) — products live in different buildings; a shared shelf would float between buildings — if user wanted one shared text across products, shelf ownership moves to director-global.
- Ruling: Layout "all of them" = a fourth mode `all` (multi-floor snaking) plus live switching among snake/pan/stacked/all in the HUD — matches "option of having all active" — if user meant several layouts visible simultaneously, needs a split-view feature.
- Ruling: Backspace answers combined as HUD options: `backspaceStyle` closeup|debris(+broom); spaces always removed by the gap arm; in-flight `reject`|`shoot` — user chose "A + B + C" and "A + B, choose from HUD".
- Ruling: Forklift on → Enter ships the row (irreversible, backspace cannot reach it); forklift off → Enter is a reversible newline — a shipped row physically left the scene.
- Ruling: Letter-mark "shape" = glyph-shaped body variant per product (thick glass-tube glyph for bottle, etc.) — literal letter-shaped bottle body is not a lathe shape — cosmetic.
- Ruling: `!` product shakes and foam-geysers on the shelf then stays (not destroyed) — fun without removing user text — trivial to change.
- Ruling: Idle demo types a phrase, waits 8s, then backspaces it all with the shotgun, loops while idle — showcases every feature unattended — could annoy; HUD toggle exists.
- Ruling: Escape toggles the HUD (no letter hotkeys, letters are for typing).
- Ruling: Work on branch `feat/factory-line` off an initial docs commit on `main` in a freshly initialized repo — SDD forbids implementing on main; repo had no git — none.
- Ruling: No external spec exists beyond `docs/original-plan.md` + chat Q&A; rulings are provisional against it.
- Ruling: Sounds are procedural Web Audio now; `audio/samples.ts` provider stub kept unwired for future base64 samples (user: "A for now but also build for B").

- Ruling (2026-10-16, user interview): pivot from Hairline 2D SVG to Three.js with four looks (realistic, lineart,
  flat iso, cutaway); procedural machines; first products cast metal letter then glass bottle; pacing modes
  auto/fast/detailed/cinematic; keep all old features, built alongside; desktop target; sound default off.
  Old Task 5 demo line rejected by the user as placeholder boxes — never ship placeholder visuals as a result.

- Rulings for Tasks 5–12 (R1–R26) are recorded in the SDD ledger and summarised in the final report;
  key ones: letters keep glyph-cell baseline (R2/R3); shelved letters stand in front of planks (R17b);
  shelf is a flat 3-row tray with older rows stepping back, robot rail behind (R24, SHELF_FRONT 220);
  per-object cutaway clipping (R12); line-art crease term at 3 CSS px (R8); stations use roles only (R16).

## Pre-flight scan

| Pair / Task | Produces → Consumes | Finding |
| --- | --- | --- |
| T2 → T5 | types, settings, Line, layout, Shelf, input, events → director/factoryHost | consistent names in Shared interfaces |
| T3 → T6/7/11/12 | glyphPaths + surfaces → product renderers | consistent |
| T4 → T5–T12 | AudioBus + SoundName → stations | SoundName list must contain every sound used later; checked: kiln/oven/neon/bend/injection/forklift/explosion included. `dust` particle used in T8 broom is not in T5 kinds → ruling below |
| T5 → T8 | director BackspaceHandler hook → backspace.ts | consistent |
| T6 inspection → T8 chute → T10 defects | reject result → chute visuals → re-enqueue | consistent; T6 only returns 'reject' |
| T7 robotArm placer → T5 director placement | optional `placer` on StationInstance | T7 adds field to T5 interface; allowed |
| T9 stats ↔ T10 defects | defect rate needs rejected counts | stats reads director events; consistent |
| Each task self-consistency | files listed vs files touched | T5 lists factories/demo replaced by T6/T7 registry — fine |

- Ruling: T8 broom uses `smoke` particles (not a non-existent `dust` kind) — keeps particle kinds fixed in T5 — none.

- Ruling (T1): Pulled minor finding "accent classes beat kernel .nf/.fo" into fix round 1 — later tasks (neon, flash) combine them — none.

- Ruling (T2): `Shelf.peekLast()` returns `{kind:'busy'}` when a newline would be crossed while the last row still holds dying/debris slots; the director (T8) must keep a pending-backspace count and retry on `slot:removed` — avoids moving animating slots across rows — a swallowed/late backspace if T8 forgets the retry.
- Ruling (T2): Line phase callbacks are queued and flushed after each tick (callbacks may mutate the Line); `remove()` sets phase `destroyed` and returns the job — director reacts to events synchronously — none.
- Ruling (T2): share text capped at 2000 chars.

## Notes for later tasks

- `layoutStations().floors` = list of floor z values (not per-station index).
- Shelf helpers available: `removeNewline`, `markDying`, `attachJob`, `getSlot`.
- Glyph cell: u 0..0.7, caps/digits occupy v 0..0.8 (baseline 0.8, descenders to 1). Pass `offset:[0,0.1]` to centre caps. `flatSurface` never culls (caller orients). `topSurface` fits a 0.7:1 rect in the disc; use `scale<1` for margin. Cylinder glyph aspect depends on arc/radius/height (default arc π/2).
- vitest has no `@/` alias; tests import by relative path.
- Line drops a pending event if its job changed phase before flush (only happens for jobs removed by a callback).

- TypeScript pinned to 5.9 (Next 15 needs the JS compiler API).

## Deferred minor findings

- T1: `@types/node ^26` vs Node 25 runtime (harmless).
- T1: `jsdom` installed but unused so far.
- T2: `Line.relayout` rescales conveyor distance by progress; shortened segments can leave jobs closer than MIN_GAP until head moves.
- T2: `Line` constructor throws on zero stations while `layoutStations` accepts empty list.
- T2: `lib/share.ts` imports `defaultSettings` from the zustand store module (pulls zustand into codec).
- T2: `events.ts` one throwing handler aborts delivery to later listeners.
- T2: stacked/all layout return/lift paths at y=-80 can cross footprints deeper than 160.
- T3: `O` vs `0` both plain ellipses (.54 vs .46 wide) — may be confusable at 12px; consider slashed/dotted zero.
- T3: dot ticks (0.06 long) may collapse to a point after rounding on small surfaces (round caps still render).
- T2: no test pins that 'placing'/'rejected' events survive a callback removing other jobs.
- T4: loop `stop()` doesn't cancel scheduled gain ramps before fade-out (click risk) — `audio/synth/index.ts`.
- T4: `/dev/sound` ships in prod build; uses relative imports, not `@/`.
- T4: `audio/fakeContext.ts` is test-only code in the app tree.
- T4: `AudioBus.unlock()` calls `provider.init` outside try/catch.
- T4: loop pan fixed at start; doesn't follow `setListener`.

# Progress, rulings and deferred findings

Plan: `docs/plan.md`. Controller-owned file (implementers do not edit it).

## Task status

| Task | Title | Status | Commits |
| --- | --- | --- | --- |
| 1 | Scaffold + kernel + wrapper | complete (1 fix round) | 18c7d44..4b86567 |
| 2 | Core pure logic | pending | |
| 3 | Glyphs + surfaces | pending | |
| 4 | Audio bus + synth | pending | |
| 5 | Runtime engine + director + demo factory | pending | |
| 6 | Bottle factory part 1 (stations 1–7) | pending | |
| 7 | Bottle factory part 2 (stations 8–13) | pending | |
| 8 | Destruction FX | pending | |
| 9 | HUD + gauges + live switching | pending | |
| 10 | Extras | pending | |
| 11 | Can, mug, cookie factories | pending | |
| 12 | Neon, brick, buildings, campus pan | pending | |
| 13 | Perf, reduced motion, a11y, polish | pending | |
| Final | Whole-branch review | pending | |

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

## Notes for later tasks

- `HL.tset(tw, to, now, delay)` requires `delay` (pass 0); omitting it yields NaN.
- TypeScript pinned to 5.9 (Next 15 needs the JS compiler API).

## Deferred minor findings

- T1: `@types/node ^26` vs Node 25 runtime (harmless).
- T1: `jsdom` installed but unused so far.

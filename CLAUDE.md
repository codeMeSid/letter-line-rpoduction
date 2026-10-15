# CLAUDE.md — Letter Factory Line

Read this first in every new session.

## What this is

A full-page Next.js app: every typed character runs an animated isometric line-art factory
(Hairline aesthetic) that turns raw material into a product bearing that character and shelves
it like a typewriter. Space = empty slot, Backspace = shotgun / reject chute, Enter = new row
(or forklift ships the row). Six product factories (glass bottle, can, mug, cookie, neon, toy
brick), procedural sound, collapsible HUD.

## Where things are

- `docs/plan.md` — the executable plan: Global Constraints, shared interfaces, Tasks 1–13. Binding.
- `docs/original-plan.md` — the approved high-level plan + the user's Q&A choices.
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

- `pnpm dev` — dev server (http://localhost:3000, `?debug=1` for perf overlay once Task 13 lands)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — `vitest run`
- `pnpm build` — `next build`
All three of typecheck/test/build must pass before every commit.
Tooling: pnpm, Node 25, Next 15.5 + React 19, TypeScript 5.9 (pinned `typescript@5`; Next 15 needs the JS
compiler API), vitest 5 (node env; `vitest.config.ts` loads as ESM via `"type": "module"`).
Import app code with the `@/` alias (maps to repo root).

## Non-negotiable conventions (full list: Global Constraints in `docs/plan.md`)

- `public/hairline/kernel.js` is a byte-identical copy of the Hairline kernel. Never edit it.
  Access only via `lib/hl.ts` (browser) / `lib/hl.node.ts` (tests).
- One camera `HL.Cam(45, 0.5, 1)`, ox=oy=0; camera pans via SVG viewBox. Moving objects drawn once
  at origin and translated.
- All motion inside the single `HL.register` loop (`engine/loop.ts`). No own rAF/setInterval/CSS
  keyframes for scene objects.
- Palette: kernel classes + project accent classes (`acc-*`) only. No inline colours.
- Letters in the drawing only via `engine/glyphs.ts` stroke glyphs. No `<text>` in the world SVG.
- Sound only via `audio/bus.ts`.
- One responsibility per file; each station its own file.

## Architecture (fills in as tasks land)

- `lib/` — `hl.ts` typed kernel wrapper (`hl()` → `window.HL`; `tset` needs an explicit delay arg, 0 for none),
  `hl.node.ts` (`loadHL()` for tests), `share.ts` (`encodeShare`/`decodeShare`: `p`, `t`, `s` query params; invalid → null). `lib/hl.test.ts` checks the header hash (sha256 of everything after line 1, i.e.
  `tail -n +2 kernel.js | shasum -a 256`) and pins the whole-file sha256 — update only if the kernel is deliberately re-vendored.
- `app/` — `layout.tsx` (loads kernel via `next/script` beforeInteractive), `page.tsx` (client component,
  `dynamic(..., { ssr:false })` → Scene), `globals.css` (full-viewport override, accent vars + `acc-*` classes)
- `engine/` — pure & unit-tested (no DOM): `types`, `charset`, `settings` (zustand store + `useSettings`), `clock` (WPM/speedMul),
  `events` (typed emitter), `layout` (`layoutStations`: anchors/paths per mode, footprints centred on anchors),
  `line` (`Line` pipeline; `decide` injected; jobs leave as `placing`/`rejected`; phase callbacks flush after each tick; `remove()` → `destroyed`), `input` (`keyToCommand`),
  `station` (StationDef/Instance/Ctx types, placeholder particle/audio interfaces),
  `glyphs` (`GLYPHS`/`glyph(ch)`: single-stroke set, cell u 0..0.7 × v 0..1 v-down, caps/digits 0..0.8, x-line .25, baseline .8, descender 1; unknown → `?`),
  `surface` (`flatSurface`/`cylinderSurface`/`topSurface` map normalised cell (u,v) → world Vec3; `glyphPaths(ch, surface, P, {scale, offset})` → one SVG `d`, back-facing segments culled with the kernel `facing` rule at az 45°; surface u 0..1 ↔ glyph u 0..0.7). Later: director, camera, loop, particles
- `shelf/` — `model.ts` pure `Shelf` (lazy auto-wrap at 14, per-row `endedByNewline`, `removeNewline`; `peekLast` → slot | newline | busy | null) + view later
- `audio/` — bus, synth provider, sample provider stub
- `factories/` — one folder per product + `shared/` parts and robot arm
- `fx/` — shotgun, chute, broom, forklift, workers, day/night
- `hud/` — React HUD + gauges
- `components/Scene.tsx` — client entry mounting everything (Task 1: placeholder single prism)

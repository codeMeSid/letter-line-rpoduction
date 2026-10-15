# Letter Factory Line

A full-page Next.js app: every typed character runs an animated isometric line-art factory
(Hairline aesthetic) that turns raw material into a product bearing that character.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
pnpm build      # next build
```

`public/hairline/kernel.js` is a vendored, unmodified copy of the Hairline kernel; access it only
through `lib/hl.ts`. See `CLAUDE.md` for project conventions.

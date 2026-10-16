# Letter Factory Line

A full-page Next.js app with a 3D factory built in Three.js. Every key you type sends a product through a
line of procedural machines on conveyor belts, and a robot places the finished product on a typewriter
shelf in front of the line.

The current product is a **cast metal letter**. It goes through seven stations: sand moulder, pour, cooling
tunnel, shakeout, grinder, polish, then a rail robot that places it on the shelf. The shelf is a flat tray
that shows the 3 newest rows. Older rows step back toward the robot rail.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
pnpm build      # next build
```

## Keys

| Key | Action |
| --- | --- |
| letters, digits, punctuation | make that character |
| Space | an empty pallet, which leaves an empty slot |
| Backspace | remove the last slot or row break, including a product still on the line |
| Enter | start a new shelf row |
| Escape | open or close the settings panel |

When the settings panel is open, Tab moves between its controls, and Enter or Space activates them.
Printable keys still type into the factory.

## Looks

You can switch looks from the settings panel at any time, even mid-production.

- **Realistic**: PBR materials, shadows, and bloom at high quality.
- **Line art**: background-coloured faces with an edge and crease pass.
- **Flat iso**: toon shading and an orthographic true-isometric camera.
- **Cutaway**: a straight line, sliced open by a section plane, so you can see inside the machines.

The panel also sets the pace (auto, fast, detailed, or cinematic, which runs one product at a time), the
camera (overview, follow, or cinematic), the theme, the quality, and sound (off by default). Drag to orbit,
right-drag to pan and scroll to zoom. The rig takes the camera back 4 s after you let go.

## Dev pages

These pages return a 404 in production.

- `/dev/bench`: a parts and looks bench. It has material swatches, look, theme and quality buttons, a
  particle emitter, and views of the line, a machine, the letter (a stage scrubber and character box) and
  each station (a looping fake job with a freeze-at-t slider).
- `/dev/sound`: auditions every procedural sound.

See `CLAUDE.md` for the project conventions.

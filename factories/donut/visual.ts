/** Product stages in line order. Each station's `outputStage` is the stage it leaves behind (shape(stage, 1) while the job waits). */
export const DONUT_STAGES = ['bowl', 'flour', 'dough', 'proofed', 'ring', 'fried', 'cooled', 'glazed', 'sprinkled', 'lettered'] as const;

export interface DonutVisual {
  bowl: number;     // mixing bowl scale 0..1
  fill: number;     // flour/dough mound height 0..1
  mix: number;      // 0 dry flour … 1 dough
  ring: number;     // 0..1 fraction of the dough ring extruded onto the tray
  cook: number;     // 0 raw … 1 golden brown
  glaze: number;    // 0..1 fraction of the ring coated
  sprinkles: number; // 0..1 fraction of sprinkles on
  icing: number;    // 0..1 piped letter drawn (left to right)
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage → visual mapping; donutVisual(S_k, 1) ≡ donutVisual(S_{k+1}, 0). Unknown stage = fresh empty bowl. */
export function donutVisual(stage: string, t: number): DonutVisual {
  const base: DonutVisual = { bowl: 0, fill: 0.9, mix: 1, ring: 1, cook: 1, glaze: 1, sprinkles: 1, icing: 1 };
  const early: DonutVisual = { ...base, bowl: 1, fill: 0, mix: 0, ring: 0, cook: 0, glaze: 0, sprinkles: 0, icing: 0 };
  const raw: DonutVisual = { ...base, cook: 0, glaze: 0, sprinkles: 0, icing: 0 };
  switch (stage) {
    case 'flour': return { ...early, fill: 0.35 * ss(0, 1, t) };
    case 'dough': return { ...early, fill: 0.35 + 0.1 * ss(0, 1, t), mix: ss(0, 1, t) };
    case 'proofed': return { ...early, fill: 0.45 + 0.45 * ss(0, 1, t), mix: 1 };
    case 'ring': return { ...raw, bowl: 1 - ss(0, 0.3, t), ring: ss(0.1, 1, t) };
    case 'fried': return { ...raw, cook: 0.85 * ss(0.3, 0.9, t) };
    case 'cooled': return { ...raw, cook: 0.85 + 0.15 * ss(0, 1, t) };
    case 'glazed': return { ...raw, cook: 1, glaze: ss(0.1, 1, t) };
    case 'sprinkled': return { ...raw, cook: 1, glaze: 1, sprinkles: ss(0, 1, t) };
    case 'lettered': return { ...base, icing: ss(0, 1, t) };
    default: return early;
  }
}

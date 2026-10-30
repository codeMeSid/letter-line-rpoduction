/** Product stages in line order. Each station's `outputStage` is the stage it leaves behind (shape(stage, 1) while the job waits). */
export const CAR_STAGES = ['pellets', 'melted', 'moulded', 'cooled', 'trimmed', 'axled', 'wheeled', 'painted', 'printed', 'boxed'] as const;

export interface CarVisual {
  pile: number;    // 0..1 pellet heap size
  melt: number;    // 0 loose pellets, 1 smooth molten puddle
  body: number;    // 0..1 moulded car body present
  sprue: number;   // 0..1 sprue + runner attached
  heat: number;    // 1 hot plastic … 0 cold
  axles: number;   // 0..1 axles pressed through
  wheels: number;  // 0..1 wheels pressed on (drop in from above)
  paint: number;   // 0 bare plastic … 1 painted + glazed
  glyph: number;   // 0..1 printed character
  box: number;     // 0..1 carton tray then lid
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage -> visual mapping; carVisual(S_k, 1) equals carVisual(S_{k+1}, 0). Unknown stage = fresh empty tray. */
export function carVisual(stage: string, t: number): CarVisual {
  const done: CarVisual = { pile: 0, melt: 1, body: 1, sprue: 0, heat: 0, axles: 1, wheels: 1, paint: 1, glyph: 1, box: 1 };
  const raw = { ...done, axles: 0, wheels: 0, paint: 0, glyph: 0, box: 0 };
  const hot = { ...raw, sprue: 1, heat: 1 };
  switch (stage) {
    case 'pellets': return { ...raw, body: 0, melt: 0, pile: ss(0, 1, t) };
    case 'melted': return { ...raw, body: 0, pile: 1, melt: ss(0, 1, t), heat: ss(0, 1, t) };
    case 'moulded': return { ...hot, pile: 1 - ss(0, 0.45, t), body: ss(0.2, 0.8, t), sprue: ss(0.4, 0.8, t) };
    case 'cooled': return { ...hot, heat: 1 - ss(0, 1, t) };
    case 'trimmed': return { ...raw, sprue: 1 - ss(0.2, 0.8, t) };
    case 'axled': return { ...raw, axles: ss(0, 1, t) };
    case 'wheeled': return { ...raw, axles: 1, wheels: ss(0, 1, t) };
    case 'painted': return { ...raw, axles: 1, wheels: 1, paint: ss(0, 1, t) };
    case 'printed': return { ...raw, axles: 1, wheels: 1, paint: 1, glyph: ss(0, 1, t) };
    case 'boxed': return { ...done, box: t };
    default: return { ...raw, body: 0, melt: 0, pile: 0 };
  }
}

/** Product stages in line order. Each station's `outputStage` is the stage it leaves behind (shape(stage, 1) while the job waits). */
export const BOTTLE_STAGES = ['tub', 'batch', 'mixed', 'melted', 'gob', 'parison', 'bottle-hot', 'bottle', 'filled', 'capped', 'labelled'] as const;

export interface BottleVisual {
  tub: number;     // tub scale 0..1
  layers: number;  // 0..1: the four granule layers fill one after the other
  mix: number;     // 0..1: layers blend into one batch colour
  drain: number;   // 0..1: the tub tips its batch into the furnace
  gob: number;     // 0..1: glass body present (grows as the gob is cut)
  morph: number;   // 0 gob, 1 parison, 2 bottle
  heat: number;    // 1 white-hot … 0 cold
  clear: number;   // 0 opaque molten … 1 clear glass
  emboss: number;  // 0..1 raised glyph on the body
  fill: number;    // liquid level 0..1
  foam: number;    // foam head 0..1
  cap: number;     // crown: 0 absent, (0,1) descending, 1 crimped on
  label: number;   // label band wrap 0..1 (angle / 2π)
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage → visual mapping; bottleVisual(S_k, 1) ≡ bottleVisual(S_{k+1}, 0). Unknown stage = fresh empty tub. */
export function bottleVisual(stage: string, t: number): BottleVisual {
  const base: BottleVisual = { tub: 0, layers: 1, mix: 1, drain: 1, gob: 1, morph: 2, heat: 0, clear: 1, emboss: 1, fill: 1, foam: 0, cap: 1, label: 1 };
  const early = { ...base, tub: 1, gob: 0, morph: 0, heat: 1, clear: 0, emboss: 0, fill: 0, cap: 0, label: 0 };
  switch (stage) {
    case 'batch': return { ...early, layers: ss(0, 1, t), mix: 0, drain: 0 };
    case 'mixed': return { ...early, mix: ss(0, 1, t), drain: 0 };
    case 'melted': return { ...early, drain: ss(0.15, 0.8, t) };
    case 'gob': return { ...early, tub: 1 - ss(0, 0.25, t), gob: ss(0.36, 0.5, t) };
    case 'parison': return { ...early, tub: 0, gob: 1, morph: ss(0, 1, t) };
    case 'bottle-hot': return { ...early, tub: 0, gob: 1, morph: 1 + ss(0, 0.8, t), heat: 1 - 0.15 * ss(0, 1, t), emboss: ss(0.7, 1, t) };
    case 'bottle': return { ...base, heat: 0.85 * (1 - ss(0, 1, t)), clear: ss(0.3, 1, t), fill: 0, cap: 0, label: 0 };
    case 'filled': return { ...base, fill: ss(0, 0.9, t), foam: ss(0.5, 0.9, t) * (1 - ss(0.9, 1, t)), cap: 0, label: 0 };
    case 'capped': return { ...base, cap: ss(0, 1, t), label: 0 };
    case 'labelled': return { ...base, label: t };
    default: return { ...early, layers: 0, mix: 0, drain: 0 };
  }
}

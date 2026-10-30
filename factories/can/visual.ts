/** Product stages in line order. Each station's `outputStage` is the stage it leaves behind (shape(stage, 1) while the job waits). */
export const CAN_STAGES = ['coil', 'strip', 'blank', 'cup', 'body', 'trimmed', 'washed', 'printed', 'necked', 'filled', 'seamed'] as const;

export interface CanVisual {
  coil: number;   // coil scale 0..1 (0 hidden)
  strip: number;  // flat sheet length 0..1 (0 hidden)
  body: number;   // aluminium body present 0..1
  morph: number;  // 0 disc, 1 cup, 2 tall drawn body, 3 trimmed body, 4 necked can
  dirt: number;   // 1 mill-finish with lubricant … 0 washed bright
  ink: number;    // 0..1 printed sleeve wrap (angle / 2π)
  fill: number;   // liquid level 0..1
  foam: number;   // foam head 0..1
  lid: number;    // end: 0 absent, (0,1) descending, 1 double-seamed
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage → visual mapping; canVisual(S_k, 1) ≡ canVisual(S_{k+1}, 0). Unknown stage = fresh coil. */
export function canVisual(stage: string, t: number): CanVisual {
  const done: CanVisual = { coil: 0, strip: 0, body: 1, morph: 4, dirt: 0, ink: 1, fill: 1, foam: 0, lid: 1 };
  const raw: CanVisual = { ...done, body: 0, morph: 0, dirt: 1, ink: 0, fill: 0, lid: 0 };
  switch (stage) {
    case 'strip': return { ...raw, coil: 1 - 0.65 * ss(0, 1, t), strip: ss(0, 0.6, t) };
    case 'blank': return { ...raw, coil: 0.35 * (1 - ss(0, 0.3, t)), strip: 1 - ss(0.35, 1, t), body: ss(0.3, 0.5, t) };
    case 'cup': return { ...raw, body: 1, morph: ss(0, 1, t) };
    case 'body': return { ...raw, body: 1, morph: 1 + ss(0, 1, t) };
    case 'trimmed': return { ...raw, body: 1, morph: 2 + ss(0, 1, t) };
    case 'washed': return { ...raw, body: 1, morph: 3, dirt: 1 - ss(0, 1, t) };
    case 'printed': return { ...raw, body: 1, morph: 3, dirt: 0, ink: t };
    case 'necked': return { ...done, morph: 3 + ss(0, 1, t), fill: 0, lid: 0 };
    case 'filled': return { ...done, fill: ss(0, 0.9, t), foam: ss(0.5, 0.9, t) * (1 - ss(0.9, 1, t)), lid: 0 };
    case 'seamed': return { ...done, lid: ss(0, 1, t) };
    default: return { ...raw, coil: 1 };
  }
}

/** Product stages in line order. Each station's `outputStage` is the stage it leaves behind (shape(stage, 1) while the job waits). */
export const MUG_STAGES = ['tub', 'clay', 'slip', 'cast', 'handled', 'dried', 'bisque', 'glazed', 'fired', 'printed'] as const;

export interface MugVisual {
  tub: number;     // tub scale 0..1
  fill: number;    // clay / slip level in the tub 0..1
  mix: number;     // 0 dry clay lumps … 1 cream slip
  drain: number;   // 0..1: slip drains out into the mould
  body: number;    // 0..1: cast wall grows (height)
  handle: number;  // 0 absent … 1 pressed on
  wet: number;     // 1 wet dark clay … 0 dry greenware
  heat: number;    // 0..1 kiln glow
  fire: number;    // 0 greenware … 1 bisque
  glaze: number;   // 0..1 glaze coat
  gloss: number;   // 0 matt unfired glaze … 1 glossy fired
  print: number;   // 0..1 printed glyph
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage → visual mapping; mugVisual(S_k, 1) ≡ mugVisual(S_{k+1}, 0). Unknown stage = fresh empty tub. */
export function mugVisual(stage: string, t: number): MugVisual {
  const done: MugVisual = { tub: 0, fill: 1, mix: 1, drain: 1, body: 1, handle: 1, wet: 0, heat: 0, fire: 1, glaze: 1, gloss: 1, print: 1 };
  const early: MugVisual = { ...done, tub: 1, fill: 0, mix: 0, drain: 0, body: 0, handle: 0, wet: 1, fire: 0, glaze: 0, gloss: 0, print: 0 };
  const cast = { ...early, handle: 0, wet: 1 };
  switch (stage) {
    case 'clay': return { ...early, fill: ss(0, 1, t) };
    case 'slip': return { ...early, fill: 1, mix: ss(0, 1, t) };
    case 'cast': return { ...cast, fill: 1, mix: 1, drain: ss(0, 0.3, t), tub: 1 - ss(0.3, 0.45, t), body: ss(0.4, 1, t) };
    case 'handled': return { ...cast, tub: 0, fill: 1, mix: 1, drain: 1, body: 1, handle: ss(0.1, 0.85, t) };
    case 'dried': return { ...cast, tub: 0, fill: 1, mix: 1, drain: 1, body: 1, handle: 1, wet: 1 - ss(0, 1, t) };
    case 'bisque': return { ...done, wet: 0, fire: ss(0.2, 0.7, t), glaze: 0, gloss: 0, print: 0, heat: Math.sin(Math.PI * ss(0, 1, t)) * 0.7 };
    case 'glazed': return { ...done, glaze: ss(0.2, 0.8, t), gloss: 0, print: 0 };
    case 'fired': return { ...done, gloss: ss(0.4, 1, t), print: 0, heat: Math.sin(Math.PI * ss(0, 1, t)) * 0.8 };
    case 'printed': return { ...done, print: ss(0, 1, t) };
    default: return early;
  }
}

/** Product stages in line order. Each station's `outputStage` is the stage it leaves behind (shape(stage, 1) while the job waits). */
export const COOKIE_STAGES = ['bowl', 'batch', 'dough', 'extruded', 'cut', 'chipped', 'baked', 'cooled', 'iced', 'sprinkled', 'packed'] as const;

export interface CookieVisual {
  bowl: number;      // mixing bowl scale 0..1
  layers: number;    // 0..1: the four ingredient layers fill one after the other
  mix: number;       // 0..1: layers blend into one dough colour
  r: number;         // dough radius
  h: number;         // dough height (0 = no dough yet)
  chips: number;     // 0..1: chocolate chips dropped one after another
  bake: number;      // 0 raw … 1 golden
  heat: number;      // 0..1 residual oven glow
  icing: number;     // 0..1 piped glyph progress
  sprinkles: number; // 0..1
  cup: number;       // 0..1 paper cup formed round the cookie
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const DOUGH_R = 6;      // extruded column
export const DOUGH_H = 14;
export const BALL_R = 8.5;     // cut ball
export const BALL_H = 10;
export const BAKED_R = 12;     // spread by the oven
export const BAKED_H = 5.5;

/** Pure stage → visual mapping; cookieVisual(S_k, 1) ≡ cookieVisual(S_{k+1}, 0). Unknown stage = fresh empty bowl. */
export function cookieVisual(stage: string, t: number): CookieVisual {
  const base: CookieVisual = { bowl: 0, layers: 1, mix: 1, r: BAKED_R, h: BAKED_H, chips: 1, bake: 1, heat: 0, icing: 1, sprinkles: 1, cup: 1 };
  const early = { ...base, bowl: 1, r: DOUGH_R, h: 0, chips: 0, bake: 0, icing: 0, sprinkles: 0, cup: 0 };
  switch (stage) {
    case 'batch': return { ...early, layers: ss(0, 1, t), mix: 0 };
    case 'dough': return { ...early, mix: ss(0, 1, t) };
    case 'extruded': return { ...early, bowl: 1 - ss(0, 0.25, t), h: DOUGH_H * ss(0.25, 1, t) };
    case 'cut': { const s = ss(0.4, 1, t); return { ...early, bowl: 0, r: lerp(DOUGH_R, BALL_R, s), h: lerp(DOUGH_H, BALL_H, s) }; }
    case 'chipped': return { ...early, bowl: 0, r: BALL_R, h: BALL_H, chips: ss(0, 0.9, t) };
    case 'baked': { const s = ss(0, 0.8, t); return { ...early, bowl: 0, r: lerp(BALL_R, BAKED_R, s), h: lerp(BALL_H, BAKED_H, s), chips: 1, bake: ss(0.1, 1, t), heat: 0.9 * ss(0.4, 1, t) }; }
    case 'cooled': return { ...base, heat: 0.9 * (1 - ss(0, 1, t)), icing: 0, sprinkles: 0, cup: 0 };
    case 'iced': return { ...base, icing: t, sprinkles: 0, cup: 0 };
    case 'sprinkled': return { ...base, sprinkles: t, cup: 0 };
    case 'packed': return { ...base, cup: ss(0, 1, t) };
    default: return { ...early, layers: 0, mix: 0 };
  }
}

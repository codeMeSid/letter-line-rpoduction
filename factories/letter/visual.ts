export const LETTER_STAGES = ['flask', 'moulded', 'poured', 'cooled', 'cast', 'ground', 'polished'] as const;
export type LetterStage = (typeof LETTER_STAGES)[number];

/** Everything the letter product shows, 0..1 each. */
export interface LetterVisual {
  sand: number;      // sand level in the flask
  cavity: number;    // letter-shaped cavity revealed in the sand
  fill: number;      // molten metal filled along the letter (bottom → top)
  heat: number;      // 1 white-hot … 0 cold
  flaskOpen: number; // flask halves slid apart (1 = gone)
  sandLeft: number;  // sand remaining around the casting
  rough: number;     // sprue stub + flash present (1) … ground off (0)
  polish: number;    // raw steel (0) … mirror chrome (1)
}

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Pure stage → visual mapping; letterVisual(S_k, 1) ≡ letterVisual(S_{k+1}, 0). */
export function letterVisual(stage: string, t: number): LetterVisual {
  const base: LetterVisual = { sand: 1, cavity: 1, fill: 1, heat: 1, flaskOpen: 0, sandLeft: 1, rough: 1, polish: 0 };
  switch (stage) {
    case 'moulded': return { ...base, sand: ss(0, 0.35, t), cavity: ss(0.6, 0.9, t), fill: 0 };
    case 'poured': return { ...base, fill: ss(0, 1, t) };
    case 'cooled': return { ...base, heat: 1 - ss(0, 1, t) };
    case 'cast': return { ...base, heat: 0, flaskOpen: ss(0.25, 0.7, t), sandLeft: 1 - ss(0.15, 0.85, t) };
    case 'ground': return { ...base, heat: 0, flaskOpen: 1, sandLeft: 0, rough: 1 - ss(0, 1, t) };
    case 'polished': return { ...base, heat: 0, flaskOpen: 1, sandLeft: 0, rough: 0, polish: ss(0, 1, t) };
    default: return { ...base, sand: 0, cavity: 0, fill: 0 };
  }
}

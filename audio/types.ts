/** Every sound the factory can make. The list is binding (Task 4 brief). */
export const SOUND_NAMES = [
  'key-clack', 'ding', 'pour-sand', 'mixer-churn', 'furnace-roar', 'gob-shear', 'mould-clamp',
  'air-blow', 'lehr-hum', 'camera-flash', 'laser-zap', 'reject-kick', 'water-jet', 'filler-pour',
  'cap-press', 'labeler-wrap', 'coder-tick', 'robot-servo', 'conveyor-hum', 'motor-whir',
  'kiln-roar', 'oven-hum', 'press-thump', 'hiss', 'neon-buzz', 'bend-squeak', 'injection-thunk',
  'shotgun-rack', 'shotgun-blast', 'glass-shatter', 'liquid-splash', 'ceramic-shatter', 'crunch',
  'metal-crumple', 'plastic-crack', 'broom-sweep', 'forklift-beep', 'forklift-motor',
  'explosion-fizz', 'whoosh', 'factory-bell',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

/** Sounds meant to be run as seamless, gain-controllable loops via `loop()`. */
export const LOOP_NAMES = [
  'furnace-roar', 'lehr-hum', 'conveyor-hum', 'kiln-roar', 'oven-hum', 'neon-buzz',
] as const;

export type LoopName = (typeof LOOP_NAMES)[number];
export type OneShotName = Exclude<SoundName, LoopName>;

export function isLoopName(name: SoundName): name is LoopName {
  return (LOOP_NAMES as readonly string[]).includes(name);
}

/** Per-sound options understood by providers. `pan` -1..1, `gain` linear, `rate` pitch/speed multiplier. */
export interface PlayOpts {
  pan?: number;
  gain?: number;
  rate?: number;
}

/** What a provider hands back from `play` so the bus can enforce the voice cap. */
export interface VoiceHandle {
  stop(): void;
  /** seconds until the voice ends on its own */
  readonly duration: number;
}

export interface LoopHandle {
  setGain(g: number, rampMs?: number): void;
  stop(): void;
}

export interface AudioProvider {
  init(ctx: AudioContext, out: AudioNode): void;
  /** May return a handle (preferred) so the bus can count and drop voices. */
  play(name: SoundName, opts: PlayOpts): VoiceHandle | void;
  loop(name: SoundName, opts: PlayOpts): LoopHandle;
}

export const NOOP_LOOP: LoopHandle = { setGain() {}, stop() {} };

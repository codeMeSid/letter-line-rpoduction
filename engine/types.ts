export type Vec3 = [number, number, number];
export type ProductKind = 'letter' | 'bottle' | 'can' | 'mug' | 'cookie' | 'neon' | 'brick';
export type Look = 'realistic' | 'lineart' | 'flat' | 'cutaway';
export type Pace = 'auto' | 'fast' | 'detailed' | 'cinematic';
export type Quality = 'low' | 'high';
export type LayoutMode = 'snake' | 'pan' | 'stacked' | 'all';
export type Special = 'none' | 'cap' | 'explode' | 'crate';
export type JobPhase = 'queued' | 'conveyor' | 'station' | 'placing' | 'shelved' | 'rejected' | 'destroyed';

export interface SlotRef { row: number; col: number; slotId: number }

export interface Job {
  id: number;
  slotId: number;          // shelf slot reserved at keypress
  char: string;            // '' for space carrier
  isSpace: boolean;
  special: Special;
  product: ProductKind;
  stage: string;           // product visual stage id, set by the station that last finished it
  phase: JobPhase;
  stationIndex: number;    // current or last station index (-1 before first)
  progress: number;        // 0..1 within current station or conveyor segment
  pos: Vec3;               // world position, maintained by Line
  defect: boolean;
  retries: number;
}

/** Output of `keyToCommand` (see engine/input.ts). */
export type Command =
  | { type: 'char'; char: string }
  | { type: 'space' }
  | { type: 'backspace' }
  | { type: 'enter' };

export const PRODUCT_KINDS: readonly ProductKind[] = ['letter', 'bottle', 'can', 'mug', 'cookie', 'neon', 'brick'];
export const LOOKS: readonly Look[] = ['realistic', 'lineart', 'flat', 'cutaway'];
export const PACES: readonly Pace[] = ['auto', 'fast', 'detailed', 'cinematic'];

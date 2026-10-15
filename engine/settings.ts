import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { LayoutMode, ProductKind } from './types';

export interface LetterMarks { emboss: boolean; label: boolean; cap: boolean; shape: boolean }

export interface Settings {
  product: ProductKind;
  layout: LayoutMode;
  letterMarks: LetterMarks;
  colorMode: 'accent' | 'mono';
  theme: 'light' | 'dark';
  backspaceStyle: 'closeup' | 'debris';
  inflightBackspace: 'reject' | 'shoot';
  camera: 'overview' | 'follow' | 'cinematic';
  dayNight: boolean;
  workers: boolean;
  defects: boolean;
  defectRate: number;   // 0..0.3
  idleDemo: boolean;
  forklift: boolean;
  sound: boolean;
  volume: number;       // 0..1
  hudOpen: boolean;
}

export const defaultSettings: Settings = {
  product: 'bottle',
  layout: 'snake',
  letterMarks: { emboss: true, label: true, cap: false, shape: false },
  colorMode: 'accent',
  theme: 'dark',
  backspaceStyle: 'closeup',
  inflightBackspace: 'reject',
  camera: 'overview',
  dayNight: true,
  workers: true,
  defects: true,
  defectRate: 0.06,
  idleDemo: true,
  forklift: false,
  sound: true,
  volume: 0.6,
  hudOpen: false,
};

export type SettingsState = Settings & { set(p: Partial<Settings>): void };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function normalize(p: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = { ...p };
  if (typeof out.defectRate === 'number') out.defectRate = Number.isNaN(out.defectRate) ? defaultSettings.defectRate : clamp(out.defectRate, 0, 0.3);
  if (typeof out.volume === 'number') out.volume = Number.isNaN(out.volume) ? defaultSettings.volume : clamp(out.volume, 0, 1);
  return out;
}

export const settingsStore = createStore<SettingsState>()((set) => ({
  ...defaultSettings,
  letterMarks: { ...defaultSettings.letterMarks },
  set: (p) => set(normalize(p)),
}));

export function useSettings<T>(sel: (s: Settings) => T): T {
  return useStore(settingsStore, sel);
}

import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings, settingsStore } from './settings';

afterEach(() => settingsStore.getState().set({ ...defaultSettings, letterMarks: { ...defaultSettings.letterMarks } }));

describe('settings store', () => {
  it('starts at the specified defaults', () => {
    const { set: _set, ...s } = settingsStore.getState();
    expect(s).toEqual(defaultSettings);
    expect(defaultSettings).toMatchObject({
      product: 'letter', look: 'flat', pace: 'auto', quality: 'high', sound: false, layout: 'snake', colorMode: 'accent', theme: 'dark', backspaceStyle: 'closeup',
      inflightBackspace: 'reject', camera: 'overview', defectRate: 0.06, volume: 0.6, forklift: false, hudOpen: false,
    });
    expect(defaultSettings.letterMarks).toEqual({ emboss: true, label: true, cap: false, shape: false });
  });

  it('merges partial updates and notifies subscribers', () => {
    const seen: string[] = [];
    const off = settingsStore.subscribe((s) => seen.push(s.theme));
    settingsStore.getState().set({ theme: 'light' });
    off();
    expect(settingsStore.getState().theme).toBe('light');
    expect(settingsStore.getState().product).toBe('letter');
    expect(seen).toEqual(['light']);
  });

  it('clamps defectRate to 0..0.3 and volume to 0..1', () => {
    const { set } = settingsStore.getState();
    set({ defectRate: 5, volume: -2 });
    expect(settingsStore.getState().defectRate).toBe(0.3);
    expect(settingsStore.getState().volume).toBe(0);
    set({ defectRate: -1, volume: 9 });
    expect(settingsStore.getState().defectRate).toBe(0);
    expect(settingsStore.getState().volume).toBe(1);
    set({ defectRate: NaN });
    expect(settingsStore.getState().defectRate).toBe(0.06);
  });

  it('does not share the letterMarks object with defaultSettings', () => {
    expect(settingsStore.getState().letterMarks).not.toBe(defaultSettings.letterMarks);
  });
});

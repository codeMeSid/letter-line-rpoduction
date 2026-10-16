import { describe, expect, it } from 'vitest';
import { keyRoute, keyToCommand, type KeyEventLike, type KeyTargetLike } from './input';

const ev = (key: string, o: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...o,
});

describe('keyToCommand', () => {
  it('maps characters, space, backspace, enter', () => {
    expect(keyToCommand(ev('a'))).toEqual({ type: 'char', char: 'a' });
    expect(keyToCommand(ev('Q'))).toEqual({ type: 'char', char: 'Q' });
    expect(keyToCommand(ev('7'))).toEqual({ type: 'char', char: '7' });
    expect(keyToCommand(ev('!'))).toEqual({ type: 'char', char: '!' });
    expect(keyToCommand(ev('%'))).toEqual({ type: 'char', char: '%' });
    expect(keyToCommand(ev(' '))).toEqual({ type: 'space' });
    expect(keyToCommand(ev('Backspace'))).toEqual({ type: 'backspace' });
    expect(keyToCommand(ev('Enter'))).toEqual({ type: 'enter' });
  });

  it('ignores ctrl/meta/alt combos', () => {
    expect(keyToCommand(ev('a', { ctrlKey: true }))).toBeNull();
    expect(keyToCommand(ev('a', { metaKey: true }))).toBeNull();
    expect(keyToCommand(ev('a', { altKey: true }))).toBeNull();
    expect(keyToCommand(ev('Backspace', { metaKey: true }))).toBeNull();
  });

  it('ignores Enter repeats but allows repeated chars, spaces and backspace', () => {
    expect(keyToCommand(ev('Enter', { repeat: true }))).toBeNull();
    expect(keyToCommand(ev('a', { repeat: true }))).toEqual({ type: 'char', char: 'a' });
    expect(keyToCommand(ev(' ', { repeat: true }))).toEqual({ type: 'space' });
    expect(keyToCommand(ev('Backspace', { repeat: true }))).toEqual({ type: 'backspace' });
  });

  it('ignores keys outside the charset', () => {
    for (const k of ['Shift', 'Tab', 'Escape', 'ArrowLeft', 'F5', 'Dead', 'Unidentified', '<', '~', 'é', '']) {
      expect(keyToCommand(ev(k))).toBeNull();
    }
  });

  it('ignores keys while focus is in form controls or contenteditable', () => {
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA', 'input']) {
      expect(keyToCommand(ev('a', { target: { tagName } }))).toBeNull();
    }
    expect(keyToCommand(ev('a', { target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull();
    expect(keyToCommand(ev('a', { target: { tagName: 'DIV', getAttribute: () => '' } }))).toBeNull();
    expect(keyToCommand(ev('a', { target: { tagName: 'DIV', getAttribute: () => 'true' } }))).toBeNull();
  });

  it('still handles keys from non-editable targets', () => {
    expect(keyToCommand(ev('a', { target: { tagName: 'BODY' } }))).toEqual({ type: 'char', char: 'a' });
    expect(keyToCommand(ev('a', { target: { tagName: 'DIV', getAttribute: () => 'false' } }))).toEqual({ type: 'char', char: 'a' });
    expect(keyToCommand(ev('a', { target: { tagName: 'DIV', getAttribute: () => null } }))).toEqual({ type: 'char', char: 'a' });
    expect(keyToCommand(ev('a', { target: null }))).toEqual({ type: 'char', char: 'a' });
  });
});

describe('keyRoute (factory page with the HUD)', () => {
  /** fake element: `inside` = the selectors it sits within */
  const el = (tagName: string, inside: string[] = [], type?: string): KeyTargetLike => ({
    tagName, type, closest: (sel: string) => (sel.split(',').some((x) => inside.includes(x.trim())) ? {} : null),
  });
  const body = el('BODY');
  const toggle = el('BUTTON', ['.hud-toggle']);
  const select = el('SELECT', ['.hud']);
  const button = el('BUTTON', ['.hud']);
  const checkbox = el('INPUT', ['.hud'], 'checkbox');

  it('Escape toggles the HUD from anywhere', () => {
    for (const t of [body, toggle, select]) expect(keyRoute('Escape', false, t)).toBe('hud');
    expect(keyRoute('Escape', true, select)).toBe('hud');
  });
  it('Tab is swallowed while the HUD is closed (focus never lands on the toggle), and moves focus while it is open', () => {
    expect(keyRoute('Tab', false, body)).toBe('block');
    expect(keyRoute('Tab', false, toggle)).toBe('block');
    for (const t of [body, select, button, checkbox]) expect(keyRoute('Tab', true, t)).toBe('control');
  });
  it('the focused toggle keeps only Space and Enter; everything else types', () => {
    expect(keyRoute(' ', false, toggle)).toBe('control');
    expect(keyRoute('Enter', false, toggle)).toBe('control');
    for (const k of ['a', 'Backspace', 'Z', '7']) expect(keyRoute(k, false, toggle)).toBe('factory');
  });
  it('printable typing on a HUD select, button or checkbox goes to the factory', () => {
    for (const t of [select, button, checkbox]) {
      expect(keyRoute('a', true, t)).toBe('factory');
      expect(keyRoute('!', true, t)).toBe('factory');
    }
  });
  it('HUD controls keep their own keys: Space/Enter/arrows; text and range inputs keep everything', () => {
    for (const t of [select, button, checkbox]) for (const k of [' ', 'Enter', 'ArrowDown']) expect(keyRoute(k, true, t)).toBe('control');
    for (const type of ['range', 'text']) {
      const input = el('INPUT', ['.hud'], type);
      for (const k of ['a', ' ', 'ArrowLeft', 'Backspace']) expect(keyRoute(k, true, input)).toBe('control');
    }
  });
  it('keys on the page type', () => {
    for (const k of ['a', ' ', 'Enter', 'Backspace']) {
      expect(keyRoute(k, false, body)).toBe('factory');
      expect(keyRoute(k, true, body)).toBe('factory');
    }
    expect(keyRoute('a', false, null)).toBe('factory');
  });
});

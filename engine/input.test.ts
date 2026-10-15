import { describe, expect, it } from 'vitest';
import { keyToCommand, type KeyEventLike } from './input';

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

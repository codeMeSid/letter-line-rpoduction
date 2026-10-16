import { isPrintable } from './charset';
import type { Command } from './types';

/** DOM-free shape of `KeyboardEvent.target` (an Element in the browser). */
export interface KeyTargetLike {
  tagName?: string;
  /** an <input>'s type */
  type?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
  closest?(selectors: string): unknown;
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target?: KeyTargetLike | null;
}

const EDITABLE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

function isEditableTarget(t: KeyTargetLike | null | undefined): boolean {
  if (!t) return false;
  if (t.tagName && EDITABLE_TAGS.has(t.tagName.toUpperCase())) return true;
  if (t.isContentEditable) return true;
  const ce = t.getAttribute?.('contenteditable');
  return ce != null && ce !== 'false';
}

export function keyToCommand(e: KeyEventLike): Command | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isEditableTarget(e.target)) return null;
  switch (e.key) {
    case 'Enter':
      return e.repeat ? null : { type: 'enter' };
    case 'Backspace':
      return { type: 'backspace' };
    case ' ':
      return { type: 'space' };
    default:
      return isPrintable(e.key) ? { type: 'char', char: e.key } : null;
  }
}

/**
 * What a keydown does on the factory page: 'hud' toggles the HUD, 'block' swallows it, 'control' leaves
 * it to the focused HUD control, 'factory' types (the caller blurs a HUD control first). Tab only moves
 * focus inside the open HUD; a HUD control never swallows printable typing unless it is a text/range input.
 */
export function keyRoute(key: string, hudOpen: boolean, t: KeyTargetLike | null | undefined): 'hud' | 'block' | 'control' | 'factory' {
  if (key === 'Escape') return 'hud';
  if (key === 'Tab') return hudOpen ? 'control' : 'block';
  if (t?.closest?.('.hud-toggle')) return key === ' ' || key === 'Enter' ? 'control' : 'factory';
  if (!t?.closest?.('.hud')) return 'factory';
  const tag = t.tagName?.toUpperCase();
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && t.type !== 'checkbox')) return 'control';
  return isPrintable(key) ? 'factory' : 'control';
}

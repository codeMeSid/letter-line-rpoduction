import { isPrintable } from './charset';
import type { Command } from './types';

/** DOM-free shape of `KeyboardEvent.target` (an Element in the browser). */
export interface KeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
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

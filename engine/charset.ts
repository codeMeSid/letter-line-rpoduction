import type { Special } from './types';

export const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' + `.,!?'"-_:;()/&@#+=*%`;

const SET = new Set(CHARSET);

/** True for exactly one character that belongs to CHARSET (space excluded). */
export function isPrintable(ch: string): boolean {
  return ch.length === 1 && SET.has(ch);
}

export function specialFor(ch: string): Special {
  if (ch === '.') return 'cap';
  if (ch === '!') return 'explode';
  if (ch.length === 1 && ch >= '0' && ch <= '9') return 'crate';
  return 'none';
}

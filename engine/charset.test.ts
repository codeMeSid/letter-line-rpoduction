import { describe, expect, it } from 'vitest';
import { CHARSET, isPrintable, specialFor } from './charset';

describe('charset', () => {
  it('accepts letters, digits and the listed punctuation', () => {
    for (const ch of CHARSET) expect(isPrintable(ch)).toBe(true);
    for (const ch of `.,!?'"-_:;()/&@#+=*%`) expect(isPrintable(ch)).toBe(true);
    expect(CHARSET.length).toBe(26 + 26 + 10 + 20);
  });

  it('rejects space, control keys, other symbols and multi-char strings', () => {
    for (const ch of [' ', '', 'Enter', 'ab', '\n', '<', '>', '[', '~', '`', '\\', '{', 'é', '😀']) {
      expect(isPrintable(ch)).toBe(false);
    }
  });

  it('maps specials', () => {
    expect(specialFor('.')).toBe('cap');
    expect(specialFor('!')).toBe('explode');
    for (const d of '0123456789') expect(specialFor(d)).toBe('crate');
    for (const ch of 'aZ,?-_ ') expect(specialFor(ch)).toBe('none');
  });
});

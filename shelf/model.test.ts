import { describe, expect, it } from 'vitest';
import { Shelf } from './model';

function type(shelf: Shelf, s: string) {
  return [...s].map((ch) => shelf.reserve(ch === ' ' ? 'space' : 'char', ch === ' ' ? '' : ch));
}

describe('Shelf', () => {
  it('starts with one empty row and 14 columns', () => {
    const s = new Shelf();
    expect(s.cols).toBe(14);
    expect(s.rows).toEqual([[]]);
    expect(s.peekLast()).toBeNull();
    expect(s.text()).toBe('');
  });

  it('reserve returns row/col/slotId and records a reserved slot', () => {
    const s = new Shelf();
    const [a, b] = type(s, 'ab');
    expect(a).toMatchObject({ row: 0, col: 0 });
    expect(b).toMatchObject({ row: 0, col: 1 });
    expect(a.slotId).not.toBe(b.slotId);
    expect(s.rows[0][0]).toEqual({ id: a.slotId, kind: 'char', char: 'a', state: 'reserved', jobId: null });
    expect(s.slotPos(b.slotId)).toEqual({ row: 0, col: 1 });
  });

  it('auto-wraps at 14 columns lazily (no empty row after exactly 14)', () => {
    const s = new Shelf();
    const refs = type(s, 'abcdefghijklmn');
    expect(refs[13]).toMatchObject({ row: 0, col: 13 });
    expect(s.rows).toHaveLength(1);
    const next = s.reserve('char', 'o');
    expect(next).toMatchObject({ row: 1, col: 0 });
    expect(s.rows).toHaveLength(2);
    expect(s.endedByNewline).toEqual([false, false]);
    expect(s.text()).toBe('abcdefghijklmn\no');
  });

  it('newline starts a new row and is remembered', () => {
    const s = new Shelf();
    type(s, 'hi');
    s.newline();
    expect(s.rows).toHaveLength(2);
    expect(s.endedByNewline).toEqual([true, false]);
    expect(s.reserve('char', 'x')).toMatchObject({ row: 1, col: 0 });
    expect(s.text()).toBe('hi\nx');
  });

  it('consecutive newlines make blank rows', () => {
    const s = new Shelf();
    s.newline();
    s.newline();
    expect(s.rows).toHaveLength(3);
    expect(s.text()).toBe('\n\n');
  });

  it('peekLast returns the last slot, then a newline marker on an empty row after a newline', () => {
    const s = new Shelf();
    const [a, b] = type(s, 'ab');
    expect(s.peekLast()?.kind).toBe('char');
    expect(s.peekLast()).toMatchObject({ id: b.slotId });
    s.newline();
    expect(s.peekLast()).toEqual({ kind: 'newline' });
    expect(s.removeNewline()).toBe(true);
    expect(s.endedByNewline).toEqual([false]);
    expect(s.peekLast()).toMatchObject({ id: b.slotId });
    s.remove(b.slotId);
    expect(s.peekLast()).toMatchObject({ id: a.slotId });
    s.remove(a.slotId);
    expect(s.peekLast()).toBeNull();
  });

  it('removeNewline refuses unless the last row is empty and follows a newline', () => {
    const s = new Shelf();
    expect(s.removeNewline()).toBe(false);
    type(s, 'a');
    expect(s.removeNewline()).toBe(false);
    s.newline();
    type(s, 'b');
    expect(s.removeNewline()).toBe(false);
  });

  it('backspace on an empty auto-wrapped row falls back to the previous row (no newline marker)', () => {
    const s = new Shelf();
    const refs = type(s, 'abcdefghijklmnop'); // 16 chars -> second row has o,p
    s.remove(refs[15].slotId);
    expect(s.rows).toHaveLength(2);
    s.remove(refs[14].slotId);
    expect(s.rows).toHaveLength(1);
    expect(s.endedByNewline).toEqual([false]);
    expect(s.peekLast()).toMatchObject({ id: refs[13].slotId });
    expect(s.reserve('char', 'z')).toMatchObject({ row: 1, col: 0 });
  });

  it('removing the last slot of a newline-started row keeps the row (newline marker next)', () => {
    const s = new Shelf();
    type(s, 'a');
    s.newline();
    const [b] = type(s, 'b');
    s.remove(b.slotId);
    expect(s.rows).toHaveLength(2);
    expect(s.peekLast()).toEqual({ kind: 'newline' });
  });

  it('peekLast skips dying and debris slots', () => {
    const s = new Shelf();
    const [a, b, c, d] = type(s, 'abcd');
    s.markFilled(a.slotId);
    s.markFilled(b.slotId);
    s.markDebris(d.slotId);
    s.markDying(c.slotId);
    expect(s.peekLast()).toMatchObject({ id: b.slotId, state: 'filled' });
    s.markDebris(b.slotId);
    expect(s.peekLast()).toMatchObject({ id: a.slotId });
    s.markDying(a.slotId);
    expect(s.peekLast()).toBeNull();
  });

  it('peekLast skips destroyed slots across rows and reports a newline if one is crossed', () => {
    const s = new Shelf();
    const [a] = type(s, 'a');
    s.newline();
    const [b] = type(s, 'b');
    s.markDying(b.slotId);
    expect(s.peekLast()).toEqual({ kind: 'newline' });
    s.remove(b.slotId);
    s.removeNewline();
    expect(s.peekLast()).toMatchObject({ id: a.slotId });
  });

  it('peekLast crosses an auto-wrap boundary silently', () => {
    const s = new Shelf();
    const refs = type(s, 'abcdefghijklmno');
    s.markDebris(refs[14].slotId);
    expect(s.peekLast()).toMatchObject({ id: refs[13].slotId });
  });

  it('markFilled / markDebris / attachJob update state; unknown ids are ignored', () => {
    const s = new Shelf();
    const [a] = type(s, 'a');
    s.markFilled(a.slotId);
    s.attachJob(a.slotId, 7);
    expect(s.getSlot(a.slotId)).toMatchObject({ state: 'filled', jobId: 7 });
    s.markDebris(a.slotId);
    expect(s.getSlot(a.slotId)?.state).toBe('debris');
    s.markFilled(999);
    s.remove(999);
    expect(s.getSlot(999)).toBeNull();
    expect(() => s.slotPos(999)).toThrow(RangeError);
  });

  it('text() renders spaces, omits destroyed slots, joins rows with \\n', () => {
    const s = new Shelf();
    const refs = type(s, 'a b');
    expect(s.text()).toBe('a b');
    s.markDebris(refs[2].slotId);
    expect(s.text()).toBe('a ');
    s.newline();
    type(s, 'c!');
    expect(s.text()).toBe('a \nc!');
  });

  it('slotPos tracks row/col after removals', () => {
    const s = new Shelf();
    const refs = type(s, 'abc');
    s.remove(refs[0].slotId);
    expect(s.slotPos(refs[2].slotId)).toEqual({ row: 0, col: 1 });
  });

  it('shipRow only ships a full or newline-terminated first row', () => {
    const s = new Shelf();
    type(s, 'abc');
    expect(s.shipRow()).toBeNull();
    s.newline();
    type(s, 'def');
    const shipped = s.shipRow();
    expect(shipped?.map((x) => x.char)).toEqual(['a', 'b', 'c']);
    expect(s.rows).toHaveLength(1);
    expect(s.text()).toBe('def');
    expect(s.endedByNewline).toEqual([false]);
    expect(s.shipRow()).toBeNull();
  });

  it('ships a full row, shifts later rows up and keeps an empty row when none remain', () => {
    const s = new Shelf();
    const refs = type(s, 'abcdefghijklmnop');
    const shipped = s.shipRow();
    expect(shipped).toHaveLength(14);
    expect(s.text()).toBe('op');
    expect(s.slotPos(refs[14].slotId)).toEqual({ row: 0, col: 0 });
    expect(s.shipRow()).toBeNull();

    const t = new Shelf();
    type(t, 'abcdefghijklmn');
    expect(t.shipRow()).toHaveLength(14);
    expect(t.rows).toEqual([[]]);
    expect(t.endedByNewline).toEqual([false]);
    expect(t.reserve('char', 'x')).toMatchObject({ row: 0, col: 0 });
  });

  it('ships a blank newline-terminated row', () => {
    const s = new Shelf();
    s.newline();
    expect(s.shipRow()).toEqual([]);
    expect(s.rows).toHaveLength(1);
  });
});

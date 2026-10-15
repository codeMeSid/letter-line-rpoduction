import type { SlotRef } from '../engine/types';

export type SlotState = 'reserved' | 'filled' | 'debris' | 'dying';

export interface Slot {
  id: number;
  kind: 'char' | 'space';
  char: string;
  state: SlotState;
  jobId: number | null;
}

export interface NewlineMarker { kind: 'newline' }
/**
 * The target is behind slots still being destroyed (dying/debris) in the last row after a newline;
 * the caller should retry after the next slot removal.
 */
export interface BusyMarker { kind: 'busy' }

/**
 * Typewriter shelf model (pure). Rows of up to `cols` slots; a row either wraps automatically
 * (when the next slot is reserved) or is closed by `newline()` (`endedByNewline`).
 * There is always at least one row.
 */
export class Shelf {
  cols = 14;
  rows: Slot[][] = [[]];
  /** endedByNewline[r] is true when row r was closed by newline(). Parallel to `rows`. */
  endedByNewline: boolean[] = [false];
  private nextId = 1;

  reserve(kind: 'char' | 'space', char: string): SlotRef {
    if (this.rows[this.rows.length - 1].length >= this.cols) this.pushRow();
    const row = this.rows.length - 1;
    const slot: Slot = { id: this.nextId++, kind, char, state: 'reserved', jobId: null };
    this.rows[row].push(slot);
    return { row, col: this.rows[row].length - 1, slotId: slot.id };
  }

  /** Close the current row and start a new one. */
  newline(): void {
    this.endedByNewline[this.rows.length - 1] = true;
    this.pushRow();
  }

  /**
   * Undo the last newline(): only when the last row is empty and the row before it was closed by a
   * newline. Returns whether anything was removed.
   */
  removeNewline(): boolean {
    const r = this.rows.length - 1;
    if (r < 1 || this.rows[r].length > 0 || !this.endedByNewline[r - 1]) return false;
    this.rows.pop();
    this.endedByNewline.pop();
    this.endedByNewline[r - 1] = false;
    return true;
  }

  /** Remove row 0 (forklift) if it is full or newline-terminated; returns its slots, else null. */
  shipRow(): Slot[] | null {
    const first = this.rows[0];
    if (first.length < this.cols && !this.endedByNewline[0]) return null;
    this.rows.shift();
    this.endedByNewline.shift();
    if (this.rows.length === 0) {
      this.rows.push([]);
      this.endedByNewline.push(false);
    }
    return first;
  }

  /**
   * Backspace target: the last slot not already being destroyed (state `dying`/`debris`);
   * `{kind:'newline'}` when the last row is truly empty and the previous row was closed by a newline;
   * `{kind:'busy'}` when a newline-started row still holds only dying/debris slots (a newline is never
   * crossed while destroyed slots remain; retry after the next slot removal); null when nothing is left.
   * Auto-wrap boundaries are crossed silently.
   */
  peekLast(): Slot | NewlineMarker | BusyMarker | null {
    for (let r = this.rows.length - 1; r >= 0; r--) {
      const row = this.rows[r];
      for (let c = row.length - 1; c >= 0; c--) {
        const s = row[c];
        if (s.state !== 'dying' && s.state !== 'debris') return s;
      }
      if (r > 0 && this.endedByNewline[r - 1]) return row.length > 0 ? { kind: 'busy' } : { kind: 'newline' };
    }
    return null;
  }

  markFilled(slotId: number): void {
    this.setState(slotId, 'filled');
  }

  markDebris(slotId: number): void {
    this.setState(slotId, 'debris');
  }

  markDying(slotId: number): void {
    this.setState(slotId, 'dying');
  }

  attachJob(slotId: number, jobId: number | null): void {
    const s = this.find(slotId);
    if (s) s.slot.jobId = jobId;
  }

  getSlot(slotId: number): Slot | null {
    return this.find(slotId)?.slot ?? null;
  }

  /**
   * Remove a slot. If that empties the last row and the row was an auto-wrap (the previous row was
   * not closed by a newline), the empty row is dropped so the cursor falls back to the previous row.
   */
  remove(slotId: number): void {
    const f = this.find(slotId);
    if (!f) return;
    this.rows[f.row].splice(f.col, 1);
    const last = this.rows.length - 1;
    if (f.row === last && last > 0 && this.rows[last].length === 0 && !this.endedByNewline[last - 1]) {
      this.rows.pop();
      this.endedByNewline.pop();
    }
  }

  /** Shelf text, rows joined with '\n'. Destroyed (debris/dying) slots are omitted; spaces are ' '. */
  text(): string {
    return this.rows
      .map((row) => row.map((s) => (s.state === 'dying' || s.state === 'debris' ? '' : s.kind === 'space' ? ' ' : s.char)).join(''))
      .join('\n');
  }

  slotPos(slotId: number): { row: number; col: number } {
    const f = this.find(slotId);
    if (!f) throw new RangeError(`unknown slot ${slotId}`);
    return { row: f.row, col: f.col };
  }

  private pushRow(): void {
    this.rows.push([]);
    this.endedByNewline.push(false);
  }

  private setState(slotId: number, state: SlotState): void {
    const s = this.find(slotId);
    if (s) s.slot.state = state;
  }

  private find(slotId: number): { slot: Slot; row: number; col: number } | null {
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r].findIndex((s) => s.id === slotId);
      if (c >= 0) return { slot: this.rows[r][c], row: r, col: c };
    }
    return null;
  }
}

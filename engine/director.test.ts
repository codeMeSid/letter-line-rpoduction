import { describe, expect, it } from 'vitest';
import { Director, PLACE_TIME, type BackspaceHandler } from './director';
import { Line } from './line';
import { layoutStations } from './layout';
import { defaultSettings, type Settings } from './settings';
import type { StationDef } from './station';
import type { ProductKind, Vec3 } from './types';

const station = (id: string, duration: number): StationDef => ({
  id, label: id, footprint: [60, 60], height: 40, duration,
  create() { throw new Error('not used'); },
});

function setup(over: Partial<Settings> = {}) {
  const settings: Settings = { ...defaultSettings, ...over };
  const sounds: string[] = [];
  let now = 0;
  const d = new Director({ settings: () => settings, now: () => now, audio: { play: (n) => { sounds.push(n); } } });
  const lines = {} as Record<ProductKind, Line>;
  for (const kind of ['bottle', 'can'] as ProductKind[]) {
    const defs = [station('a', 0.2), station('b', 0.2)];
    const lay = layoutStations(defs, 'pan', [0, 0, 0]);
    const line = new Line(defs, lay.anchors, lay.paths);
    lines[kind] = line;
    const shelf = d.shelf(kind);
    d.attach(kind, {
      line, firstStage: 'raw',
      slotPos: (id) => {
        const s = shelf.getSlot(id);
        if (!s) return null;
        const { row, col } = shelf.slotPos(id);
        return [col * 20, 300, 100 - row * 30] as Vec3;
      },
    });
  }
  const run = (seconds: number) => { for (let t = 0; t < seconds; t += 0.05) { now += 50; d.update(0.05); } };
  const typeStr = (s: string) => { for (const ch of s) d.handle(ch === ' ' ? { type: 'space' } : { type: 'char', char: ch }); };
  return { d, settings, sounds, lines, run, typeStr };
}

describe('Director routing', () => {
  it('char reserves a slot, creates a job on the active line and clacks', () => {
    const { d, lines, sounds } = setup();
    const created: number[] = [];
    d.events.on('job:created', ({ job }) => created.push(job.id));
    d.handle({ type: 'char', char: 'A' });
    expect(lines.bottle.jobs).toHaveLength(1);
    expect(lines.can.jobs).toHaveLength(0);
    const job = lines.bottle.jobs[0];
    expect(job).toMatchObject({ char: 'A', isSpace: false, stage: 'raw', product: 'bottle', phase: 'queued' });
    expect(d.shelf('bottle').getSlot(job.slotId)).toMatchObject({ kind: 'char', char: 'A', state: 'reserved', jobId: job.id });
    expect(created).toEqual([job.id]);
    expect(sounds).toEqual(['key-clack']);
  });

  it('routes to the factory selected in settings', () => {
    const { d, lines, settings } = setup();
    settings.product = 'can';
    d.handle({ type: 'char', char: 'x' });
    expect(lines.can.jobs).toHaveLength(1);
    expect(lines.bottle.jobs).toHaveLength(0);
  });

  it('ignores typing for a product with no mounted factory', () => {
    const { d, settings } = setup();
    settings.product = 'mug';
    d.handle({ type: 'char', char: 'x' });
    expect(d.shelf('mug').text()).toBe('');
  });

  it('marks specials and space carriers', () => {
    const { d, lines } = setup();
    d.handle({ type: 'char', char: '.' });
    d.handle({ type: 'char', char: '7' });
    d.handle({ type: 'space' });
    expect(lines.bottle.jobs.map((j) => [j.special, j.isSpace, j.char])).toEqual([
      ['cap', false, '.'], ['crate', false, '7'], ['none', true, ''],
    ]);
  });

  it('jobs ride the line, arc onto the shelf in order, and shelve', () => {
    const { d, run, typeStr } = setup();
    const filled: number[] = [];
    d.events.on('slot:filled', ({ slotId }) => filled.push(slotId));
    typeStr('ab c');
    run(10 + 4 * PLACE_TIME);
    const shelf = d.shelf('bottle');
    expect(shelf.text()).toBe('ab c');
    expect(shelf.rows[0].every((s) => s.state === 'filled')).toBe(true);
    expect(filled).toEqual(shelf.rows[0].map((s) => s.id));
    expect(d.jobsOf('bottle')).toHaveLength(0);
  });

  it('placement arcs from the last anchor to the slot', () => {
    const { d, run, typeStr } = setup();
    typeStr('a');
    let peak = -Infinity;
    const zs: number[] = [];
    d.events.on('job:phase', ({ job }) => { if (job.phase === 'shelved') zs.push(job.pos[2]); });
    for (let i = 0; i < 400 && zs.length === 0; i++) {
      run(0.05);
      const j = d.jobsOf('bottle')[0];
      if (j?.phase === 'placing') peak = Math.max(peak, j.pos[2]);
    }
    expect(zs).toEqual([100]);
    expect(peak).toBeGreaterThan(100);
  });

  it('dings when the row-end slot (col 13) is shelved', () => {
    const { d, run, typeStr, sounds } = setup();
    typeStr('abcdefghijklmn');
    run(14 * 0.5 + 10);
    expect(d.shelf('bottle').rows[0]).toHaveLength(14);
    expect(sounds.filter((s) => s === 'ding')).toHaveLength(1);
  });

  it('enter starts a new row; with forklift it ships the closed row', () => {
    const { d, typeStr } = setup();
    const rows: number[] = [];
    d.events.on('row:new', ({ row }) => rows.push(row));
    typeStr('ab');
    d.handle({ type: 'enter' });
    typeStr('c');
    expect(d.shelf('bottle').text()).toBe('ab\nc');
    expect(rows).toEqual([1]);

    const f = setup({ forklift: true });
    const shipped: string[] = [];
    f.d.events.on('row:shipped', ({ slots }) => shipped.push(slots.map((s) => s.char).join('')));
    f.typeStr('hi');
    f.d.handle({ type: 'enter' });
    expect(shipped).toEqual(['hi']);
    expect(f.d.shelf('bottle').text()).toBe('');
  });

  it('backspace removes an in-flight job and its slot', () => {
    const { d, lines, typeStr } = setup();
    const removed: number[] = [];
    d.events.on('slot:removed', ({ slotId }) => removed.push(slotId));
    typeStr('ab');
    const b = lines.bottle.jobs[1];
    d.handle({ type: 'backspace' });
    expect(lines.bottle.jobs.map((j) => j.char)).toEqual(['a']);
    expect(b.phase).toBe('destroyed');
    expect(removed).toEqual([b.slotId]);
    expect(d.shelf('bottle').text()).toBe('a');
  });

  it('backspace removes a placing job, shelved slots, spaces and newlines', () => {
    const { d, run, typeStr } = setup();
    typeStr('a b');
    run(20);
    d.handle({ type: 'enter' });
    expect(d.shelf('bottle').text()).toBe('a b\n');
    d.handle({ type: 'backspace' }); // newline
    expect(d.shelf('bottle').text()).toBe('a b');
    d.handle({ type: 'backspace' }); // shelved b
    d.handle({ type: 'backspace' }); // shelved space
    expect(d.shelf('bottle').text()).toBe('a');

    typeStr('z');
    for (let i = 0; i < 400 && d.jobsOf('bottle')[0]?.phase !== 'placing'; i++) run(0.05);
    const z = d.jobsOf('bottle')[0];
    expect(z.phase).toBe('placing');
    d.handle({ type: 'backspace' });
    expect(z.phase).toBe('destroyed');
    expect(d.jobsOf('bottle')).toHaveLength(0);
    run(2);
    expect(d.shelf('bottle').text()).toBe('a');
  });

  it('delegates backspace to a registered handler', () => {
    const { d, typeStr } = setup();
    const seen: string[] = [];
    const h: BackspaceHandler = { handleBackspace: (t, ctx) => seen.push(`${t.kind}:${ctx.kind}`) };
    d.setBackspaceHandler(h);
    typeStr('a');
    d.handle({ type: 'backspace' });
    expect(seen).toEqual(['char:bottle']);
    expect(d.shelf('bottle').text()).toBe('a');
  });

  it('typing speeds the sim clock up', () => {
    const { d, typeStr } = setup();
    expect(d.speedMul(0)).toBe(1);
    typeStr('abcdefghij');
    expect(d.speedMul(0)).toBeGreaterThan(1);
  });
});

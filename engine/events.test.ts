import { describe, expect, it } from 'vitest';
import { createEmitter } from './events';

interface M { a: number; b: string; c: void }

describe('createEmitter', () => {
  it('delivers typed payloads to subscribers of that type only', () => {
    const e = createEmitter<M>();
    const a: number[] = [];
    const b: string[] = [];
    e.on('a', (n) => a.push(n));
    e.on('b', (s) => b.push(s));
    e.emit('a', 1);
    e.emit('b', 'x');
    e.emit('a', 2);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual(['x']);
  });

  it('off unsubscribes; emitting with no listeners is fine', () => {
    const e = createEmitter<M>();
    const seen: number[] = [];
    const off = e.on('a', (n) => seen.push(n));
    e.emit('a', 1);
    off();
    off();
    e.emit('a', 2);
    e.emit('c', undefined);
    expect(seen).toEqual([1]);
  });

  it('supports unsubscribing during emit and multiple listeners in order', () => {
    const e = createEmitter<M>();
    const order: string[] = [];
    const offFirst = e.on('a', () => {
      order.push('first');
      offFirst();
      offSecond();
    });
    const offSecond = e.on('a', () => order.push('second'));
    e.on('a', () => order.push('third'));
    e.emit('a', 0);
    e.emit('a', 0);
    expect(order).toEqual(['first', 'third', 'third']);
  });
});

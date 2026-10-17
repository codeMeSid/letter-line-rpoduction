import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, MAX_SHARE_TEXT } from './share';
import { defaultSettings } from '../engine/settings';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

describe('share codec', () => {
  it('round-trips text with newlines, punctuation and spaces', () => {
    const text = `Hello, World!\n  it's 5 o'clock...\n"quoted" (a/b) & c@d #1 +2=3 *4% -_:;?\n`;
    const out = decodeShare(encodeShare({ product: 'mug', text, settings: {} }));
    expect(out).toEqual({ product: 'mug', text, settings: {} });
  });

  it('round-trips every product and empty text', () => {
    for (const product of ['letter', 'bottle', 'cookie', 'donut', 'mug', 'can', 'car'] as const) {
      expect(decodeShare(encodeShare({ product, text: '', settings: {} }))).toEqual({ product, text: '', settings: {} });
    }
  });

  it('round-trips all text lengths (base64 padding cases)', () => {
    for (let n = 0; n < 12; n++) {
      const text = 'abcdefghijkl'.slice(0, n);
      expect(decodeShare(encodeShare({ product: 'can', text, settings: {} }))?.text).toBe(text);
    }
  });

  it('matches standard base64url for the t parameter', () => {
    expect(encodeShare({ product: 'can', text: 'hi?!\n', settings: {} })).toBe(`p=can&t=${b64('hi?!\n')}`);
  });

  it('encodes only non-default settings', () => {
    const qs = encodeShare({
      product: 'can',
      text: 'x',
      settings: { ...defaultSettings, theme: 'light', volume: 0.2, letterMarks: { emboss: true, label: true, cap: true, shape: false } },
    });
    const s = new URLSearchParams(qs).get('s')!;
    expect(JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))).toEqual({
      theme: 'light', volume: 0.2, letterMarks: { emboss: true, label: true, cap: true, shape: false },
    });
    expect(decodeShare(qs)?.settings).toEqual({
      theme: 'light', volume: 0.2, letterMarks: { emboss: true, label: true, cap: true, shape: false },
    });
  });

  it('omits s when all settings are default and drops product from settings', () => {
    const qs = encodeShare({ product: 'car', text: 'a', settings: { ...defaultSettings, product: 'donut' } });
    expect(qs).not.toContain('s=');
    expect(qs).toContain('p=car');
  });

  it('accepts a leading ?', () => {
    expect(decodeShare('?' + encodeShare({ product: 'can', text: 'q', settings: {} }))?.text).toBe('q');
  });

  it('returns null (never throws) for invalid input', () => {
    const bad = [
      '', '?', 'garbage', 'p=', 'p=toaster', 't=YQ', 'p=can&t=***', 'p=can&t=A', 'p=can&t=%FF%FE',
      `p=can&t=${b64('bad<char>')}`, `p=can&t=${Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url')}`,
      'p=can&s=not-json', `p=can&s=${b64('[1,2]')}`, `p=can&s=${b64('null')}`, `p=can&s=${b64('"x"')}`,
      `p=can&s=${b64('{"theme":"neon"}')}`, `p=can&s=${b64('{"volume":7}')}`, `p=can&s=${b64('{"defectRate":0.9}')}`,
      `p=can&s=${b64('{"unknown":1}')}`, `p=can&s=${b64('{"product":"mug"}')}`, `p=can&s=${b64('{"letterMarks":{"emboss":1}}')}`,
      `p=can&s=${b64('{"letterMarks":null}')}`, '%E0%A4%A', 'p=can&t=' + 'A'.repeat(5),
    ];
    for (const input of bad) expect(() => decodeShare(input), input).not.toThrow();
    for (const input of bad) expect(decodeShare(input), input).toBeNull();
  });

  it('rejects inherited Object.prototype names as setting keys', () => {
    for (const json of ['{"toString":1}', '{"constructor":{}}', '{"__proto__":{}}', '{"valueOf":true}', '{"hasOwnProperty":1}']) {
      expect(decodeShare(`p=can&s=${b64(json)}`), json).toBeNull();
    }
  });

  it('truncates decoded text to 2000 characters', () => {
    const long = 'a'.repeat(2500);
    const out = decodeShare(encodeShare({ product: 'can', text: long, settings: {} }));
    expect(MAX_SHARE_TEXT).toBe(2000);
    expect(out?.text).toHaveLength(2000);
    const exact = 'b\n'.repeat(1000);
    expect(decodeShare(encodeShare({ product: 'can', text: exact, settings: {} }))?.text).toBe(exact);
  });

  it('is deterministic', () => {
    const a = encodeShare({ product: 'cookie', text: 'ab\ncd', settings: { camera: 'follow', layout: 'all' } });
    expect(encodeShare({ product: 'cookie', text: 'ab\ncd', settings: { camera: 'follow', layout: 'all' } })).toBe(a);
  });

  it('round-trips look / pace / quality and rejects an invalid look', () => {
    const settings = { look: 'cutaway', pace: 'cinematic', quality: 'low' } as const;
    expect(decodeShare(encodeShare({ product: 'letter', text: 'a', settings }))).toEqual({ product: 'letter', text: 'a', settings });
    expect(decodeShare(`p=letter&s=${b64('{"look":"neon"}')}`)).toBeNull();
  });
});

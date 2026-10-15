import { isPrintable } from '../engine/charset';
import { defaultSettings, type LetterMarks, type Settings } from '../engine/settings';
import { PRODUCT_KINDS, type ProductKind } from '../engine/types';

export interface SharePayload {
  product: ProductKind;
  text: string;
  settings: Partial<Settings>;
}

/** Decoded share text is truncated to this many characters. */
export const MAX_SHARE_TEXT = 2000;

// ---- base64url (hand-rolled so this stays DOM/Node-API free) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function b64urlDecode(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const vals: number[] = [];
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    vals.push(v);
  }
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const n = (vals[i] << 18) | ((vals[i + 1] ?? 0) << 12) | ((vals[i + 2] ?? 0) << 6) | (vals[i + 3] ?? 0);
    out.push((n >> 16) & 255);
    if (i + 2 < vals.length) out.push((n >> 8) & 255);
    if (i + 3 < vals.length) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

const encodeText = (s: string) => b64urlEncode(new TextEncoder().encode(s));

function decodeText(s: string): string | null {
  const bytes = b64urlDecode(s);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// ---- settings validation ----
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf = <T extends string>(...opts: T[]) => (v: unknown): v is T => typeof v === 'string' && (opts as string[]).includes(v);
const inRange = (lo: number, hi: number) => (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isMarks = (v: unknown): v is LetterMarks => {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return isBool(m.emboss) && isBool(m.label) && isBool(m.cap) && isBool(m.shape);
};

type Validators = { [K in Exclude<keyof Settings, 'product'>]: (v: unknown) => v is Settings[K] };
const validators: Validators = {
  layout: oneOf('snake', 'pan', 'stacked', 'all'),
  letterMarks: isMarks,
  colorMode: oneOf('accent', 'mono'),
  theme: oneOf('light', 'dark'),
  backspaceStyle: oneOf('closeup', 'debris'),
  inflightBackspace: oneOf('reject', 'shoot'),
  camera: oneOf('overview', 'follow', 'cinematic'),
  dayNight: isBool,
  workers: isBool,
  defects: isBool,
  defectRate: inRange(0, 0.3),
  idleDemo: isBool,
  forklift: isBool,
  sound: isBool,
  volume: inRange(0, 1),
  hudOpen: isBool,
};
const SETTING_KEYS = Object.keys(validators) as (keyof Validators)[];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Query string (no leading '?'): p=product, t=base64url(text), s=base64url(JSON of non-default settings). */
export function encodeShare({ product, text, settings }: SharePayload): string {
  const parts = [`p=${product}`];
  if (text) parts.push(`t=${encodeText(text)}`);
  const diff: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) {
    const v = settings[k];
    if (v !== undefined && !sameValue(v, defaultSettings[k])) diff[k] = v;
  }
  if (Object.keys(diff).length > 0) parts.push(`s=${encodeText(JSON.stringify(diff))}`);
  return parts.join('&');
}

const isShareChar = (ch: string) => ch === ' ' || ch === '\n' || isPrintable(ch);

/** Parse a share query string (with or without '?'). Returns null on any invalid input; never throws. */
export function decodeShare(search: string): SharePayload | null {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const p = params.get('p');
    if (!p || !(PRODUCT_KINDS as readonly string[]).includes(p)) return null;

    let text = '';
    const t = params.get('t');
    if (t) {
      const decoded = decodeText(t);
      if (decoded === null || ![...decoded].every(isShareChar)) return null;
      text = decoded.slice(0, MAX_SHARE_TEXT);
    }

    const settings: Partial<Settings> = {};
    const s = params.get('s');
    if (s) {
      const json = decodeText(s);
      if (json === null) return null;
      const raw: unknown = JSON.parse(json);
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
      const target = settings as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        if (!Object.hasOwn(validators, k)) return null;
        if (!validators[k as keyof Validators](v)) return null;
        target[k] = v;
      }
    }
    return { product: p as ProductKind, text, settings };
  } catch {
    return null;
  }
}

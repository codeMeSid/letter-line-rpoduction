import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HLKernel } from './hl';

/** Path of the vendored kernel, relative to the repo root. */
export const KERNEL_PATH = join(process.cwd(), 'public', 'hairline', 'kernel.js');

/** Tests only: evaluates the vendored kernel source and returns its `HL` global. */
export function loadHL(): HLKernel {
  const src = readFileSync(KERNEL_PATH, 'utf8');
  return new Function(src + ';return HL;')() as HLKernel;
}

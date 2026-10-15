import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HLKernel } from './hl';

/** Path of the vendored kernel, resolved from this file. */
export const KERNEL_PATH = fileURLToPath(new URL('../public/hairline/kernel.js', import.meta.url));

/** Tests only: evaluates the vendored kernel source and returns its `HL` global. */
export function loadHL(): HLKernel {
  const src = readFileSync(KERNEL_PATH, 'utf8');
  return new Function(src + ';return HL;')() as HLKernel;
}

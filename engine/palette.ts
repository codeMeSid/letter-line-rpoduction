/**
 * Canvas colours for particles, read from the CSS variables on the world root so theme
 * (`data-hairline-theme`) and colour mode (`data-color`) apply. Call `refresh()` after either changes.
 */
export type ColorKey = 'plate' | 'hi' | 'edge' | 'mid' | 'lo' | 'molten' | 'drink' | 'neon' | 'flash' | 'glass' | 'label';

const VARS: Record<ColorKey, string> = {
  plate: '--hl-plate', hi: '--hl-hi', edge: '--hl-edge', mid: '--hl-mid', lo: '--hl-lo',
  molten: '--acc-molten', drink: '--acc-drink', neon: '--acc-neon', flash: '--acc-flash', glass: '--acc-glass', label: '--acc-label',
};
const ACCENTS = new Set<ColorKey>(['molten', 'drink', 'neon', 'flash', 'glass', 'label']);

export class Palette {
  private colors = {} as Record<ColorKey, string>;

  constructor(private root: Element | null = null) {
    for (const k of Object.keys(VARS) as ColorKey[]) this.colors[k] = '#888';
    this.refresh();
  }

  refresh(): void {
    if (!this.root || typeof getComputedStyle === 'undefined') return;
    const cs = getComputedStyle(this.root);
    const mono = this.root.getAttribute('data-color') === 'mono';
    for (const k of Object.keys(VARS) as ColorKey[]) {
      // Mono mode: accents fall back to the hi stroke colour, like the SVG accent classes.
      const v = cs.getPropertyValue(VARS[mono && ACCENTS.has(k) ? 'hi' : k]).trim();
      if (v) this.colors[k] = v;
    }
  }

  get(k: ColorKey): string {
    return this.colors[k];
  }
}

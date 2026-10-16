import { describe, expect, it } from 'vitest';
import { chain } from './post';

describe('post chain', () => {
  it('realistic/cutaway: bloom only on high quality', () => {
    for (const look of ['realistic', 'cutaway'] as const) {
      expect(chain(look, 'high')).toEqual(['render', 'bloom', 'output']);
      expect(chain(look, 'low')).toEqual(['render', 'output']);
    }
  });
  it('lineart: edge, never bloom', () => {
    expect(chain('lineart', 'high')).toEqual(['render', 'edge', 'output']);
    expect(chain('lineart', 'low')).toEqual(['render', 'edge', 'output']);
  });
  it('flat: render then output', () => {
    expect(chain('flat', 'high')).toEqual(['render', 'output']);
    expect(chain('flat', 'low')).toEqual(['render', 'output']);
  });
});

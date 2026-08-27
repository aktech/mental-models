import { describe, expect, it } from 'vitest';
import { OG_HEIGHT, OG_WIDTH, renderOgCard } from './og';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('renderOgCard', () => {
  it('renders a real 1200 x 630 PNG with the fonts on disk', async () => {
    const png = await renderOgCard({ title: 'Where a user’s pods land', description: 'A short description.' });
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(pngSize(png)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
    expect(png.length).toBeGreaterThan(10_000);
  });

  it('produces a different image for different text', async () => {
    const a = await renderOgCard({ title: 'One', description: 'x' });
    const b = await renderOgCard({ title: 'Two', description: 'x' });
    expect(a.equals(b)).toBe(false);
  });
});

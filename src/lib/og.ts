import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

/*
  Open Graph card, 1200 x 630, rendered at build time. Same palette and type
  as the site: off-white ground, navy text, amber rule, Fira Sans.
*/

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const BG = '#f7f7f2';
const FG = '#101a31';
const FG_70 = 'rgba(16, 26, 49, 0.7)';
const AMBER = '#8a5b00';

export interface OgCard {
  title: string;
  description: string;
}

// Resolved from the project root: the build runs from there, and import.meta.url would point into dist/.
const fontFile = (weight: 400 | 600) => resolve(process.cwd(), `node_modules/@fontsource/fira-sans/files/fira-sans-latin-${weight}-normal.woff`);

let fontsPromise: Promise<{ regular: Buffer; semibold: Buffer }> | undefined;
function fonts() {
  fontsPromise ??= Promise.all([readFile(fontFile(400)), readFile(fontFile(600))]).then(([regular, semibold]) => ({ regular, semibold }));
  return fontsPromise;
}

// Satori takes a React-like element tree; plain objects keep this file JSX-free.
const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

export async function renderOgCard({ title, description }: OgCard): Promise<Buffer> {
  const { regular, semibold } = await fonts();
  const long = title.length > 28;

  const tree = el(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '64px 72px',
      background: BG,
      color: FG,
      fontFamily: 'Fira Sans',
    },
    [
      el('div', { display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }, [
        {
          type: 'svg',
          props: {
            width: 36,
            height: 36,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: FG,
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            children: [
              { type: 'path', props: { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' } },
              { type: 'path', props: { d: 'M9 18h6' } },
              { type: 'path', props: { d: 'M10 22h4' } },
            ],
          },
        },
        'mental models',
      ]),
      el('div', { display: 'flex', flexDirection: 'column', gap: 24 }, [
        el('div', { width: 96, height: 6, background: AMBER, borderRadius: 3 }),
        el('div', { fontSize: long ? 60 : 76, fontWeight: 600, lineHeight: 1.08, letterSpacing: '-0.03em' }, title),
        el('div', { fontSize: 28, lineHeight: 1.4, color: FG_70, maxWidth: 1000 }, description),
      ]),
      el('div', { fontSize: 24, color: FG_70 }, 'iamit.in/mental-models'),
    ],
  );

  const svg = await satori(tree as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      { name: 'Fira Sans', data: regular, weight: 400, style: 'normal' },
      { name: 'Fira Sans', data: semibold, weight: 600, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}

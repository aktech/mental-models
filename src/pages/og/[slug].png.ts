import type { APIRoute, GetStaticPaths } from 'astro';
import { renderOgCard } from '../../lib/og';
import { ogPages } from '../../lib/pages';

export const getStaticPaths: GetStaticPaths = async () =>
  (await ogPages()).map((page) => ({ params: { slug: page.slug }, props: { page } }));

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgCard(props.page);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};

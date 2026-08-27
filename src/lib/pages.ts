import { getCollection } from 'astro:content';
import type { OgCard } from './og';

/*
  Every page that gets its own social card, keyed by the slug used at
  /og/<slug>.png. The layout looks a page up here from its URL.
*/

export const SITE_NAME = 'mental models';
export const SITE_TAGLINE = 'A collection of mental models, mostly backend and infra, and whatever else I need to hold in my head.';

export interface OgPage extends OgCard {
  slug: string;
}

export async function ogPages(): Promise<OgPage[]> {
  const entries = (await getCollection('models')).sort((a, b) => a.data.order - b.data.order);
  return [
    { slug: 'index', title: 'Mental models', description: SITE_TAGLINE },
    { slug: 'about', title: 'About', description: SITE_TAGLINE },
    ...entries.map((e) => ({ slug: e.id, title: e.data.title, description: e.data.description })),
  ];
}

/** The card slug for a path under the site base: "" -> index, "about" -> about, "models/x" -> x. */
export function ogSlugForPath(pathname: string, base: string): string {
  const rel = pathname.replace(base.replace(/\/$/, ''), '').replace(/^\/|\/$/g, '');
  if (rel === '') return 'index';
  const parts = rel.split('/');
  return parts[0] === 'models' && parts[1] ? parts[1] : parts[0]!;
}

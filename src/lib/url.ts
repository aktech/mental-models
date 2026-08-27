/** Join a site base path and a root-relative path without doubling the slash. */
export function joinBase(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/** Prefix a root-relative path with the site's base path (just the path in dev without one). */
export function withBase(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

/** The social-card slug for a path under the base: "" -> index, "about" -> about, "models/x" -> x. */
export function ogSlugForPath(pathname: string, base: string): string {
  const rel = pathname.replace(base.replace(/\/$/, ''), '').replace(/^\/|\/$/g, '');
  if (rel === '') return 'index';
  const parts = rel.split('/');
  return parts[0] === 'models' && parts[1] ? parts[1] : parts[0]!;
}

export function getWikiPagePath(slug: string): string {
  return `/wiki/${encodeURIComponent(slug)}`;
}

export function getWikiPageSlug(routeSlug: string): string {
  try {
    return decodeURIComponent(routeSlug);
  } catch {
    return routeSlug;
  }
}

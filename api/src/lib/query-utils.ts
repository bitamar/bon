/**
 * Escape LIKE/ILIKE special characters so user input is treated as literal text.
 * PostgreSQL LIKE wildcards: % (any sequence), _ (any single char), \ (escape char).
 */
export function escapeLikePattern(s: string): string {
  return s.replaceAll(/[%_\\]/g, String.raw`\$&`);
}

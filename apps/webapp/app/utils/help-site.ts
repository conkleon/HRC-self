/**
 * Help Site Links
 *
 * Builds links to the help and marketing site (knowledge base, blog, store,
 * privacy policy) from `HELP_SITE_URL`. An instance that sets no help site
 * gets `null` back, and callers hide the link instead of pointing users at a
 * site this instance does not run. Safe on both sides because
 * `HELP_SITE_URL` is part of `getBrowserEnv()`.
 *
 * @see {@link file://./env.ts}
 */

import { HELP_SITE_URL } from "./env";

/**
 * Resolves a path on the configured help site.
 *
 * @param path - Path on the help site, e.g. `/knowledge-base/asset-reminders`
 * (query strings and fragments are kept)
 * @param baseUrl - Help site base URL; defaults to `HELP_SITE_URL`
 * @returns The absolute URL, or null when no help site is configured or the
 * base URL cannot be parsed
 */
export function helpSiteUrl(
  path: string,
  baseUrl: string | undefined = HELP_SITE_URL
): string | null {
  const base = baseUrl?.trim();
  if (!base) return null;
  try {
    const origin = new URL(base).toString().replace(/\/+$/, "");
    return `${origin}/${path.replace(/^\/+/, "")}`;
  } catch {
    return null;
  }
}

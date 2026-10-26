/**
 * Route Web App Manifest
 *
 * Decides which web app manifest the document links. Every page links the
 * app-wide `/manifest.webmanifest`, unless a matched route names its own
 * through its `handle`. A browser reads only one manifest per page, so a
 * route's manifest replaces the default rather than joining it.
 *
 * The self-service page uses this so a shortcut saved from it opens that
 * workspace's link, not the app's sign-in page.
 *
 * @see {@link file://./../root.tsx}
 * @see {@link file://./../routes/self-service+/$token.tsx}
 */
import type { Params } from "react-router";

/** The app-wide manifest every page links by default. */
export const DEFAULT_MANIFEST_HREF = "/manifest.webmanifest";

/** A route `handle` that names the page's own manifest. */
export type ManifestHandle = {
  /** The manifest URL for this page, from the route's params */
  manifest: (params: Params) => string;
};

/** The parts of a route match this module reads. */
type ManifestMatch = { handle: unknown; params: Params };

/** Whether a route handle names its own manifest. */
function isManifestHandle(handle: unknown): handle is ManifestHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    "manifest" in handle &&
    typeof handle.manifest === "function"
  );
}

/**
 * The manifest URL for the current page: the deepest matched route's own, or
 * the app-wide default.
 *
 * @param matches - The matched routes, outermost first (`useMatches()`)
 * @returns The `href` for `<link rel="manifest">`
 */
export function manifestHrefFor(matches: ManifestMatch[]): string {
  for (let i = matches.length - 1; i >= 0; i--) {
    const { handle, params } = matches[i];
    if (isManifestHandle(handle)) return handle.manifest(params);
  }
  return DEFAULT_MANIFEST_HREF;
}

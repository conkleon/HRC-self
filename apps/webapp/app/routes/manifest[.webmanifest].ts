/**
 * Web App Manifest
 *
 * Served at `/manifest.webmanifest` so "Add to Home Screen" installs the app
 * under the instance's own name and icon (`APP_NAME`, `BRANDING_DIR/icon.*`)
 * rather than Shelf's. Built per request from the branding the server
 * resolved at startup; public (listed in the server's `publicPaths`) because
 * browsers fetch it without credentials.
 *
 * A page can link its own manifest instead through its route `handle` (see
 * `manifestHrefFor` in `root.tsx`); the self-service page does.
 *
 * @see {@link file://./../modules/branding/instance-branding.server.ts}
 * @see {@link file://./../modules/branding/web-manifest.server.ts}
 * @see {@link file://./../root.tsx} - links it from every page
 */

import { getInstanceBranding } from "~/modules/branding/instance-branding.server";
import {
  getManifestIcons,
  manifestResponse,
} from "~/modules/branding/web-manifest.server";

/**
 * Resource route loader returning the manifest JSON.
 *
 * @returns The manifest with `application/manifest+json` content type
 */
export function loader() {
  const { appName } = getInstanceBranding();

  return manifestResponse({
    name: appName,
    lang: "en-US",
    short_name: appName,
    description:
      "Asset and equipment tracking: create QR asset labels, manage and overview your assets across locations.",
    start_url: "/",
    display: "standalone",
    scope: "/",
    theme_color: "#FFFFFF",
    background_color: "#FFFFFF",
    icons: getManifestIcons(),
  });
}

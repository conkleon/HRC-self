/**
 * Web App Manifest
 *
 * Served at `/manifest.webmanifest` so "Add to Home Screen" installs the app
 * under the instance's own name and icon (`APP_NAME`, `BRANDING_DIR/icon.*`)
 * rather than Shelf's. Built per request from the branding the server
 * resolved at startup; public (listed in the server's `publicPaths`) because
 * browsers fetch it without credentials.
 *
 * @see {@link file://./../modules/branding/instance-branding.server.ts}
 * @see {@link file://./../root.tsx} - links it from every page
 */

import { getInstanceBranding } from "~/modules/branding/instance-branding.server";

/** Content type per accepted branding icon extension. */
const ICON_TYPES: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  jpg: "image/jpeg",
};

/** Shelf's own install icon, used when no custom icon is configured. */
const SHELF_ICON = {
  src: "/static/images/shelf-logo-x512.png",
  sizes: "512x512",
  type: "image/png",
  purpose: "any",
};

/**
 * Resource route loader returning the manifest JSON.
 *
 * A custom icon's pixel size is not known without decoding it, so it is
 * declared as `sizes: "any"` and the browser scales it.
 *
 * @returns The manifest with `application/manifest+json` content type
 */
export function loader() {
  const { appName, hasCustomIcon, iconUrl } = getInstanceBranding();
  const extension = iconUrl.split(".").pop() ?? "";

  const manifest = {
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
    icons: [
      hasCustomIcon
        ? {
            src: iconUrl,
            sizes: "any",
            type: ICON_TYPES[extension] ?? "image/png",
            purpose: "any",
          }
        : SHELF_ICON,
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

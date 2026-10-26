/**
 * Web App Manifest Helpers
 *
 * The parts every web app manifest this server serves has in common: the
 * install icon from the instance branding, and the response with the manifest
 * content type. Two manifests use them: the app-wide one at
 * `/manifest.webmanifest`, and the per-workspace one a volunteer saves from a
 * self-service link, which opens that link instead of the app's home.
 *
 * @see {@link file://./../../routes/manifest[.webmanifest].ts}
 * @see {@link file://./../../routes/self-service+/$token_.manifest[.webmanifest].ts}
 */

import { getInstanceBranding } from "./instance-branding.server";

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

/** One entry of a manifest's `icons` list. */
type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
};

/**
 * The install icons for a manifest: the instance's custom icon, or Shelf's.
 *
 * A custom icon's pixel size is not known without decoding it, so it is
 * declared as `sizes: "any"` and the browser scales it.
 *
 * @returns The manifest `icons` list
 */
export function getManifestIcons(): ManifestIcon[] {
  const { hasCustomIcon, iconUrl } = getInstanceBranding();
  if (!hasCustomIcon) return [SHELF_ICON];

  const extension = iconUrl.split(".").pop() ?? "";
  return [
    {
      src: iconUrl,
      sizes: "any",
      type: ICON_TYPES[extension] ?? "image/png",
      purpose: "any",
    },
  ];
}

/**
 * Wraps a manifest object in a response browsers accept as a manifest.
 *
 * @param manifest - The manifest fields
 * @returns The JSON response with `application/manifest+json` content type
 */
export function manifestResponse(manifest: Record<string, unknown>): Response {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

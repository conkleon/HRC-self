/**
 * Branding Files
 *
 * Serves the operator's branding images (`icon.*`, `favicon.ico`,
 * `login-bg.*`) from `BRANDING_DIR` at `/branding/<file>`. Public (listed in
 * the server's `publicPaths`) because the login screen and emails show them to
 * people without a session.
 *
 * Only file names the branding resolver chose are served; anything else,
 * including traversal attempts, is a 404 without touching the filesystem.
 *
 * @see {@link file://./../modules/branding/instance-branding.server.ts}
 */

import fs from "node:fs";
import path from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { getBrandingFilePath } from "~/modules/branding/instance-branding.server";

/** Content type per accepted branding extension. */
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

/**
 * Streams one branding file.
 *
 * Files change only when the operator restarts the server, so a one-hour
 * cache is long enough to spare repeat requests and short enough that a new
 * logo shows up the same day. SVGs get a script-free CSP so one opened
 * directly cannot run code on this origin.
 *
 * @returns The file, or a 404 `Response` for anything not configured
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const filePath = getBrandingFilePath(params.file ?? "");
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  let body: Buffer;
  try {
    body = await fs.promises.readFile(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = new Headers({
    "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=3600",
  });
  if (extension === ".svg") {
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'"
    );
  }

  return new Response(new Uint8Array(body), { status: 200, headers });
}

/**
 * Self-Service Shortcut Manifest (`/self-service/:token/manifest.webmanifest`)
 *
 * The manifest a volunteer's phone reads when they tap "Add as shortcut" on a
 * self-service page. It names the shortcut after the workspace and starts it
 * at that workspace's self-service link, so the home-screen icon opens
 * straight back to the take-or-return list rather than the app's sign-in page.
 *
 * Public like the page itself (listed in the server's `publicPaths`): browsers
 * fetch manifests without credentials. It reveals nothing the page does not
 * already show before the PIN, the workspace name. An unknown or replaced
 * token answers 404, so a stale shortcut cannot be re-saved.
 *
 * @see {@link file://./$token.tsx}
 * @see {@link file://./../../components/self-custody/add-shortcut.tsx}
 */
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";

import {
  getManifestIcons,
  manifestResponse,
} from "~/modules/branding/web-manifest.server";
import { getBrowseWorkspace } from "~/modules/self-custody/browse.server";
import { makeShelfError } from "~/utils/error";
import { error, getParams } from "~/utils/http.server";

/**
 * Resource route loader returning the workspace's shortcut manifest.
 *
 * @returns The manifest with `application/manifest+json` content type
 * @throws 404 when the token names no workspace
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const { token } = getParams(params, z.object({ token: z.string() }));

  try {
    const organization = await getBrowseWorkspace(token);
    const link = `/self-service/${encodeURIComponent(token)}`;

    return manifestResponse({
      // The id ties the installed shortcut to this link, so two workspaces'
      // shortcuts on one phone stay separate.
      id: link,
      name: `${organization.name} self-service`,
      short_name: organization.name,
      lang: "en-US",
      description: `Take or return items in ${organization.name}.`,
      start_url: link,
      scope: link,
      display: "standalone",
      theme_color: "#FFFFFF",
      background_color: "#FFFFFF",
      icons: getManifestIcons(),
    });
  } catch (cause) {
    const reason = makeShelfError(cause);
    throw data(error(reason), { status: reason.status });
  }
}

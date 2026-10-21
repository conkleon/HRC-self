/**
 * Instance branding for components.
 *
 * Reads the branding the root loader resolved on the server. Error boundaries
 * and isolated renders have no root data, so they get plain Shelf branding.
 *
 * @see {@link file://./../modules/branding/instance-branding.server.ts}
 */

import { useRouteLoaderData } from "react-router";
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from "~/modules/branding/instance-branding";
import type { loader } from "~/root";

/**
 * Returns the instance's name, colors and image URLs.
 *
 * @returns The resolved branding, or Shelf defaults without root loader data
 */
export function useInstanceBranding(): InstanceBranding {
  const data = useRouteLoaderData<typeof loader>("root");
  return data?.branding ?? DEFAULT_INSTANCE_BRANDING;
}

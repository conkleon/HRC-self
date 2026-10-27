/**
 * The UI language of the current page.
 *
 * Reads the locale the root loader resolved (user choice, then the instance
 * default). Error boundaries and isolated renders have no root data and get
 * English.
 *
 * @see {@link file://../i18n/config.ts}
 */

import { useRouteLoaderData } from "react-router";
import { FALLBACK_LOCALE, type AppLocale } from "~/i18n/config";
import type { loader } from "~/root";

/**
 * Returns the active UI language.
 *
 * @returns The resolved locale, or English without root loader data
 */
export function useLocale(): AppLocale {
  const data = useRouteLoaderData<typeof loader>("root");
  return data?.locale ?? FALLBACK_LOCALE;
}

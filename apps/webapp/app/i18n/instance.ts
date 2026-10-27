/**
 * i18n Instance
 *
 * Builds an i18next instance for one locale. The server creates one per
 * render and the client one per locale change, so two requests in different
 * languages never share state. Initialisation is synchronous because every
 * resource is bundled, which keeps the first render already translated.
 *
 * @see {@link file://./resources.ts}
 * @see {@link file://../root.tsx} where the instance is provided to the tree
 */

import { createInstance, type i18n, type InitOptions } from "i18next";
import { FALLBACK_LOCALE, type AppLocale } from "./config";
import { resources } from "./resources";

/**
 * The options every i18next instance in the webapp starts from: the app's
 * own instances and the global one the unit tests install.
 *
 * @param locale - Language to render in
 * @returns Options for `i18next.init`
 */
export function i18nOptions(locale: AppLocale): InitOptions {
  return {
    lng: locale,
    fallbackLng: FALLBACK_LOCALE,
    resources,
    // why: synchronous init makes the instance usable on return; with every
    // resource bundled there is nothing to wait for.
    initAsync: false,
    // React escapes rendered strings already.
    interpolation: { escapeValue: false },
    returnNull: false,
  };
}

/**
 * Creates a ready-to-use i18next instance.
 *
 * @param locale - Language to render in
 * @returns An initialised instance; missing keys fall back to English
 */
export function createI18n(locale: AppLocale): i18n {
  const instance = createInstance();
  void instance.init(i18nOptions(locale));
  return instance;
}

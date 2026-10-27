/**
 * Translation Resources
 *
 * Every language's strings, bundled into the app so the server render and the
 * client hydrate from the same text with no extra request. One namespace,
 * `translation`, split into one JSON file per area of the app; each file is a
 * top-level key, so `t("assets.index.title")` reads `locales/<lang>/assets.json`.
 *
 * English is the source of truth: its shape types every `t()` key (see
 * `i18next.d.ts`), and every other language must mirror it exactly.
 *
 * @see {@link file://./locale-parity.test.ts}
 */

import type { AppLocale } from "./config";
import elAssets from "./locales/el/assets.json";
import elAuth from "./locales/el/auth.json";
import elBookings from "./locales/el/bookings.json";
import elCommon from "./locales/el/common.json";
import elCustody from "./locales/el/custody.json";
import elKits from "./locales/el/kits.json";
import elLabels from "./locales/el/labels.json";
import elNav from "./locales/el/nav.json";
import elScanner from "./locales/el/scanner.json";
import elSettings from "./locales/el/settings.json";
import enAssets from "./locales/en/assets.json";
import enAuth from "./locales/en/auth.json";
import enBookings from "./locales/en/bookings.json";
import enCommon from "./locales/en/common.json";
import enCustody from "./locales/en/custody.json";
import enKits from "./locales/en/kits.json";
import enLabels from "./locales/en/labels.json";
import enNav from "./locales/en/nav.json";
import enScanner from "./locales/en/scanner.json";
import enSettings from "./locales/en/settings.json";

/** English strings: the shape every other language must match. */
export const en = {
  assets: enAssets,
  auth: enAuth,
  bookings: enBookings,
  common: enCommon,
  custody: enCustody,
  kits: enKits,
  labels: enLabels,
  nav: enNav,
  scanner: enScanner,
  settings: enSettings,
};

/** The structure of a full translation: English's keys, any string values. */
export type TranslationShape = typeof en;

/** All languages, keyed by locale, in i18next's resource format. */
export const resources: Record<AppLocale, { translation: object }> = {
  en: { translation: en },
  el: {
    translation: {
      assets: elAssets,
      auth: elAuth,
      bookings: elBookings,
      common: elCommon,
      custody: elCustody,
      kits: elKits,
      labels: elLabels,
      nav: elNav,
      scanner: elScanner,
      settings: elSettings,
    },
  },
};

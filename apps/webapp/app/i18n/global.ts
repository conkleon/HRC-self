/**
 * Global English Fallback
 *
 * Registers an English i18next instance as react-i18next's global default.
 * The root `I18nextProvider` takes precedence for everything rendered in the
 * app tree; this instance only serves components rendered outside it, such as
 * labels rendered to static markup for the bulk QR download. Without it those
 * would print raw keys. It is never switched to another language, so sharing
 * it across server requests is safe.
 *
 * Imported for its side effect from `root.tsx` and the unit-test setup.
 */

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { i18nOptions } from "./instance";

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init(i18nOptions("en"));
}

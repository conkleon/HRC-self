/**
 * Types every `t()` key against the English resources, so a misspelt or
 * removed key is a compile error rather than a raw key on screen.
 */
import "i18next";
import type { TranslationShape } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: TranslationShape };
  }
}

/**
 * Shared Label Translation
 *
 * The status, type and role labels shared with the companion app live in
 * `@shelf/labels` and `@shelf/permissions` as English constants, and many
 * helpers return them as plain strings. `useLabel()` maps such a string to
 * the active language at render time, so those helpers stay pure and shared.
 *
 * Every constant is mirrored in `locales/<lang>/labels.json`; a string that is
 * not a known label is returned unchanged.
 *
 * @see {@link file://./locales/en/labels.json}
 */

import { useTranslation } from "react-i18next";
import { en } from "./resources";

/** English label text → its key in the `labels` area. */
const KEY_BY_ENGLISH = (() => {
  const map = new Map<string, string>();
  const walk = (node: object, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = `${prefix}.${key}`;
      if (typeof value === "string") {
        if (!map.has(value)) map.set(value, path);
      } else if (value && typeof value === "object") {
        walk(value, path);
      }
    }
  };
  walk(en.labels, "labels");
  return map;
})();

/**
 * Translates a shared label for the current language.
 *
 * @param english - A label from `@shelf/labels` or `ROLE_LABELS`
 * @returns The label in the active language, or the input when it is not a
 * known label
 */
export function translateLabel(
  t: (key: string) => string,
  english: string
): string {
  const key = KEY_BY_ENGLISH.get(english);
  return key ? t(key) : english;
}

/**
 * Returns a function that translates shared labels in the current language.
 *
 * @returns `(english) => translated`
 */
export function useLabel(): (english: string) => string {
  const { t } = useTranslation();
  return (english) => translateLabel(t as (key: string) => string, english);
}

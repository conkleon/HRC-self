/**
 * Locale Config
 *
 * The languages the webapp ships, and how the active one is chosen for a
 * request: the user's own choice (`User.locale`), then the instance's
 * `DEFAULT_LOCALE`, then English. Pure and safe on both sides.
 *
 * Adding a language: add its code here with its native name, add a
 * `locales/<code>/` folder mirroring `locales/en/`, and register it in
 * `resources.ts`. The parity test fails until every English key has a
 * translation.
 *
 * @see {@link file://./resources.ts}
 * @see {@link file://./locale-parity.test.ts}
 */

/** Every UI language, as BCP-47 codes. The first entry is the fallback. */
export const SUPPORTED_LOCALES = ["en", "el"] as const;

/** A UI language this webapp ships. */
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** Language used when nothing else is configured, and for missing keys. */
export const FALLBACK_LOCALE: AppLocale = "en";

/**
 * Each language's name in that language. Shown in the language picker
 * untranslated, so people can find their own language whatever the UI is in.
 */
export const LOCALE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  el: "Ελληνικά",
};

/**
 * Narrows an arbitrary string to a supported locale.
 *
 * @param value - Candidate code, e.g. from the database or env
 * @returns True when the code is one of `SUPPORTED_LOCALES`
 */
export function isSupportedLocale(
  value: string | null | undefined
): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? "");
}

/**
 * Picks the language for a request.
 *
 * @param args.userLocale - The signed-in user's saved choice; null follows
 * the instance default
 * @param args.instanceDefault - The instance's `DEFAULT_LOCALE`
 * @returns The first supported value of the two, or English
 */
export function resolveLocale({
  userLocale,
  instanceDefault,
}: {
  userLocale?: string | null;
  instanceDefault?: string | null;
}): AppLocale {
  if (isSupportedLocale(userLocale)) return userLocale;
  const normalizedDefault = instanceDefault?.trim().toLowerCase();
  if (isSupportedLocale(normalizedDefault)) return normalizedDefault;
  return FALLBACK_LOCALE;
}

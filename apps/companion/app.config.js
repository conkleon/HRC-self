/**
 * Expo app config
 *
 * Extends `app.json` with the values that depend on which server this build
 * belongs to. The host the app claims for Universal Links (iOS) and App Links
 * (Android) is read from the environment at build time, so a self-hosted
 * build claims its own domain instead of a fixed one:
 *
 * - `APP_LINK_HOST`: the host to claim, e.g. `assets.example.org`
 * - otherwise the host of `EXPO_PUBLIC_API_URL`, when that is https
 *
 * With neither set, the build claims no domain and links keep opening in the
 * browser. The checked-in iOS project reads the same `APP_LINK_HOST` through
 * `$(APP_LINK_HOST)` in `ios/Shelf/Shelf.entitlements`, so set it in the
 * environment of every iOS build as well.
 *
 * @see {@link file://./app.json}
 * @see {@link file://./lib/deep-links.ts}
 */

/** Paths the app handles natively; every other path stays on the web. */
const APP_LINK_PATH_PREFIXES = ["/qr/", "/assets/", "/bookings/", "/audits/"];

/**
 * Resolves the host to claim for app links.
 *
 * @returns The host, or null when the build should claim none
 */
function resolveAppLinkHost() {
  const explicit = process.env.APP_LINK_HOST?.trim();
  if (explicit) return explicit;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!apiUrl) return null;
  try {
    const url = new URL(apiUrl);
    // Universal Links and App Links verify over https only.
    return url.protocol === "https:" ? url.host : null;
  } catch {
    return null;
  }
}

module.exports = ({ config }) => {
  const host = resolveAppLinkHost();
  if (!host) return config;

  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: [`applinks:${host}`],
    },
    android: {
      ...config.android,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: APP_LINK_PATH_PREFIXES.map((pathPrefix) => ({
            scheme: "https",
            host,
            pathPrefix,
          })),
        },
      ],
    },
  };
};

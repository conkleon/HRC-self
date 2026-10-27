/**
 * Instance Branding (shared)
 *
 * Types, defaults and pure helpers for the instance-wide branding an operator
 * configures through `.env` (`APP_NAME`, `INSTANCE_NAME`,
 * `BRAND_PRIMARY_COLOR`) and a mounted folder (`BRANDING_DIR`). Safe to import
 * on both sides; the filesystem lookup lives in the `.server` module.
 *
 * @see {@link file://./instance-branding.server.ts}
 * @see {@link file://./../../hooks/use-instance-branding.ts}
 */

import {
  DEFAULT_PRIMARY_COLOR,
  generatePrimaryPalette,
  paletteToCssVars,
} from "~/utils/brand-palette";
import { APP_NAME } from "~/utils/env";

/** Product name used when `APP_NAME` is unset. */
export const DEFAULT_APP_NAME = "Shelf";

/** Host shown on labels and URL prefixes when `SERVER_URL` cannot be parsed. */
export const DEFAULT_APP_HOST = "shelf.nu";

/** The files an operator may place in `BRANDING_DIR`. */
export type BrandingFile = "icon" | "favicon" | "login-bg";

/**
 * Accepted extensions per branding file, in priority order. A file name is
 * served only if it matches one of these exactly, which is also what keeps
 * the `/branding/:file` route from reaching anything else in the folder.
 */
export const BRANDING_FILE_EXTENSIONS: Record<BrandingFile, string[]> = {
  icon: ["png", "svg", "webp", "jpg"],
  favicon: ["ico"],
  "login-bg": ["jpg", "webp", "png"],
};

/** Branding resolved for this instance, as shipped to every page. */
export type InstanceBranding = {
  /** Product name shown in place of "Shelf". */
  appName: string;
  /** Server name shown under the auth logo; null when unset or equal to `appName`. */
  instanceName: string | null;
  /**
   * Host this instance is served from (`SERVER_URL` without scheme), shown on
   * printed labels and as the prefix of URL-like fields such as the username.
   */
  appHost: string;
  /** Normalized `#RRGGBB` accent color. */
  primaryColor: string;
  /** `:root{...}` rule with the `--primary-*` variables. */
  primaryCssVars: string;
  /** Square icon URL (custom `/branding/...` or the Shelf symbol). */
  iconUrl: string;
  /** Favicon URL; falls back to the custom icon, then the Shelf favicon. */
  faviconUrl: string;
  /** Login background URL; null means the Shelf painting. */
  loginBgUrl: string | null;
  /** True when the operator supplied `icon.*`. */
  hasCustomIcon: boolean;
};

/** Branding of an instance that configures nothing: plain Shelf. */
export const DEFAULT_INSTANCE_BRANDING: InstanceBranding = {
  appName: DEFAULT_APP_NAME,
  instanceName: null,
  appHost: DEFAULT_APP_HOST,
  primaryColor: DEFAULT_PRIMARY_COLOR,
  primaryCssVars: paletteToCssVars(
    generatePrimaryPalette(DEFAULT_PRIMARY_COLOR)
  ),
  iconUrl: "/static/images/shelf-symbol.png",
  faviconUrl: "/static/favicon.ico",
  loginBgUrl: null,
  hasCustomIcon: false,
};

/**
 * The product name to show users. Works on both sides because `APP_NAME` is
 * part of `getBrowserEnv()`.
 *
 * @returns `APP_NAME`, or "Shelf" when unset
 */
export function getAppName(): string {
  return APP_NAME?.trim() || DEFAULT_APP_NAME;
}

/**
 * Extracts the host to show users from a server URL.
 *
 * @param serverUrl - The instance's `SERVER_URL`
 * @returns The URL's host (with port when not the default), or "shelf.nu"
 * when the URL is missing or unparseable
 */
export function resolveAppHost(serverUrl: string | undefined): string {
  if (!serverUrl) return DEFAULT_APP_HOST;
  try {
    return new URL(serverUrl).host || DEFAULT_APP_HOST;
  } catch {
    return DEFAULT_APP_HOST;
  }
}

/**
 * Picks the branding files present in a folder listing.
 *
 * @param fileNames - Names found in `BRANDING_DIR`
 * @returns The chosen file name per branding file, first extension wins
 */
export function resolveBrandingFiles(
  fileNames: string[]
): Partial<Record<BrandingFile, string>> {
  const present = new Set(fileNames);
  const resolved: Partial<Record<BrandingFile, string>> = {};
  for (const [file, extensions] of Object.entries(BRANDING_FILE_EXTENSIONS)) {
    const match = extensions
      .map((extension) => `${file}.${extension}`)
      .find((name) => present.has(name));
    if (match) {
      resolved[file as BrandingFile] = match;
    }
  }
  return resolved;
}

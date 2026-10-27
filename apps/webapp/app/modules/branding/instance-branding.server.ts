/**
 * Instance Branding (server)
 *
 * Resolves the instance branding once per process from env and the files in
 * `BRANDING_DIR`. The result rides on the root loader to every page and is
 * read directly by emails. Branding changes only on restart, which is why the
 * folder is listed once and the result memoized.
 *
 * @see {@link file://./instance-branding.ts}
 * @see {@link file://./../../routes/branding.$file.ts}
 */

import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_PRIMARY_COLOR,
  generatePrimaryPalette,
  normalizeHexColor,
  paletteToCssVars,
} from "~/utils/brand-palette";
import { getContrastRatio } from "~/utils/color-contrast";
import {
  BRAND_PRIMARY_COLOR,
  BRANDING_DIR,
  INSTANCE_NAME,
  SERVER_URL,
} from "~/utils/env";
import { Logger } from "~/utils/logger";
import type { BrandingFile, InstanceBranding } from "./instance-branding";
import {
  DEFAULT_INSTANCE_BRANDING,
  getAppName,
  resolveAppHost,
  resolveBrandingFiles,
} from "./instance-branding";

/** WCAG AA minimum for normal text, checked for white text on the accent. */
const MIN_BUTTON_TEXT_CONTRAST = 4.5;

let cachedFiles: Partial<Record<BrandingFile, string>> | null = null;
let cachedBranding: InstanceBranding | null = null;

/** Lists `BRANDING_DIR`; a missing or unreadable folder means no custom files. */
function getBrandingFiles(): Partial<Record<BrandingFile, string>> {
  if (cachedFiles) return cachedFiles;
  let names: string[] = [];
  if (BRANDING_DIR) {
    try {
      names = fs.readdirSync(BRANDING_DIR);
    } catch {
      Logger.warn(
        `BRANDING_DIR "${BRANDING_DIR}" could not be read; using default branding images.`
      );
    }
  }
  cachedFiles = resolveBrandingFiles(names);
  return cachedFiles;
}

/** Reads `BRAND_PRIMARY_COLOR`, warning about unusable or low-contrast values. */
function resolvePrimaryColor(): string {
  if (!BRAND_PRIMARY_COLOR) return DEFAULT_PRIMARY_COLOR;

  const color = normalizeHexColor(BRAND_PRIMARY_COLOR);
  if (!color) {
    Logger.warn(
      `BRAND_PRIMARY_COLOR "${BRAND_PRIMARY_COLOR}" is not a hex color; using ${DEFAULT_PRIMARY_COLOR}.`
    );
    return DEFAULT_PRIMARY_COLOR;
  }

  const ratio = getContrastRatio("#FFFFFF", color);
  if (ratio < MIN_BUTTON_TEXT_CONTRAST) {
    Logger.warn(
      `BRAND_PRIMARY_COLOR ${color} gives white button text a contrast of ${ratio.toFixed(
        2
      )}:1, below the WCAG AA minimum of ${MIN_BUTTON_TEXT_CONTRAST}:1. Consider a darker color.`
    );
  }
  return color;
}

/**
 * Returns this instance's branding, resolving it on first call.
 *
 * @returns The resolved branding; Shelf defaults for anything not configured
 */
export function getInstanceBranding(): InstanceBranding {
  if (cachedBranding) return cachedBranding;

  const files = getBrandingFiles();
  const primaryColor = resolvePrimaryColor();
  const appName = getAppName();
  const instanceName = INSTANCE_NAME?.trim() || null;
  const iconUrl = files.icon ? `/branding/${files.icon}` : null;

  cachedBranding = {
    appName,
    instanceName:
      instanceName && instanceName !== appName ? instanceName : null,
    appHost: resolveAppHost(SERVER_URL),
    primaryColor,
    primaryCssVars: paletteToCssVars(generatePrimaryPalette(primaryColor)),
    iconUrl: iconUrl ?? DEFAULT_INSTANCE_BRANDING.iconUrl,
    faviconUrl: files.favicon
      ? `/branding/${files.favicon}`
      : iconUrl ?? DEFAULT_INSTANCE_BRANDING.faviconUrl,
    loginBgUrl: files["login-bg"] ? `/branding/${files["login-bg"]}` : null,
    hasCustomIcon: Boolean(iconUrl),
  };
  return cachedBranding;
}

/**
 * Maps a requested branding file name to its path on disk.
 *
 * Only names that `resolveBrandingFiles` chose are returned, so arbitrary
 * names and traversal attempts never reach the filesystem.
 *
 * @param name - File name from the `/branding/:file` URL
 * @returns Absolute path, or null when the name is not a served branding file
 */
export function getBrandingFilePath(name: string): string | null {
  if (!BRANDING_DIR) return null;
  const served = Object.values(getBrandingFiles());
  return served.includes(name) ? path.join(BRANDING_DIR, name) : null;
}

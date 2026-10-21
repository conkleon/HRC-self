/**
 * Brand Palette
 *
 * Turns one brand color into the full `primary` shade scale that Tailwind's
 * `primary-*` classes read through CSS variables. Pure and isomorphic: the
 * server computes the variables once at startup, and `shelf.config.ts` uses
 * `normalizeHexColor` for email colors on either side.
 *
 * The default color reproduces Shelf's hand-tuned palette exactly, so an
 * instance that sets no brand color renders the same hex values as before.
 *
 * @see {@link file://./../modules/branding/instance-branding.server.ts}
 * @see {@link file://./../../tailwind.config.ts}
 */

import { hexToRgb } from "./color-contrast";

/** Every shade of the `primary` scale, lightest first. */
export const PRIMARY_SHADES = [
  25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900,
] as const;

/** One step of the `primary` scale. */
export type PrimaryShade = (typeof PRIMARY_SHADES)[number];

/** A full `primary` scale as uppercase `#RRGGBB` values. */
export type PrimaryPalette = Record<PrimaryShade, string>;

/** Shelf orange, used when no brand color is configured. */
export const DEFAULT_PRIMARY_COLOR = "#EF6820";

/** Shelf's hand-tuned scale for the default color. */
const SHELF_PRIMARY_PALETTE: PrimaryPalette = {
  25: "#FEFAF5",
  50: "#FEF6EE",
  100: "#FDEAD7",
  200: "#F9DBAF",
  300: "#F7B27A",
  400: "#F38744",
  500: "#EF6820",
  600: "#EF6820",
  700: "#EF6820",
  800: "#932F19",
  900: "#772917",
};

/** How much white is mixed into the brand color for each light shade. */
const WHITE_MIX: Partial<Record<PrimaryShade, number>> = {
  25: 0.97,
  50: 0.94,
  100: 0.85,
  200: 0.7,
  300: 0.5,
  400: 0.25,
};

/** How much black is mixed into the brand color for each dark shade. */
const BLACK_MIX: Partial<Record<PrimaryShade, number>> = {
  800: 0.4,
  900: 0.5,
};

/**
 * Normalizes a user-supplied hex color.
 *
 * Accepts `#RGB`, `#RRGGBB`, either without the `#`, any case, and
 * surrounding whitespace.
 *
 * @param input - Raw value, typically from `BRAND_PRIMARY_COLOR`
 * @returns Uppercase `#RRGGBB`, or `null` when the input is not a hex color
 */
export function normalizeHexColor(input: string | undefined): string | null {
  const value = input?.trim().replace(/^#/, "") ?? "";
  if (/^[0-9a-f]{3}$/i.test(value)) {
    const expanded = value
      .split("")
      .map((char) => char + char)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return `#${value.toUpperCase()}`;
  }
  return null;
}

/** Formats one RGB channel set as uppercase `#RRGGBB`. */
function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** Mixes `hex` toward `target` (0 to 255 per channel) by `weight`. */
function mix(hex: string, target: number, weight: number): string {
  const { r, g, b } = hexToRgb(hex);
  return toHex({
    r: r + (target - r) * weight,
    g: g + (target - g) * weight,
    b: b + (target - b) * weight,
  });
}

/**
 * Builds the `primary` scale for a brand color.
 *
 * Shades 500 to 700 are the brand color itself, matching the shape of Shelf's
 * own scale, so `primary-600` and `primary-700` buttons keep the exact color
 * the operator chose. Lighter shades mix toward white, darker toward black.
 *
 * @param hex - A normalized `#RRGGBB` color
 * @returns The full scale keyed by shade
 */
export function generatePrimaryPalette(hex: string): PrimaryPalette {
  const color = hex.toUpperCase();
  if (color === DEFAULT_PRIMARY_COLOR) {
    return { ...SHELF_PRIMARY_PALETTE };
  }

  const palette = {} as PrimaryPalette;
  for (const shade of PRIMARY_SHADES) {
    const white = WHITE_MIX[shade];
    const black = BLACK_MIX[shade];
    if (white !== undefined) {
      palette[shade] = mix(color, 255, white);
    } else if (black !== undefined) {
      palette[shade] = mix(color, 0, black);
    } else {
      palette[shade] = color;
    }
  }
  return palette;
}

/**
 * Renders a palette as the `:root` CSS variables Tailwind's `primary` colors
 * read. Each variable holds space-separated RGB channels (`239 104 32`) so
 * `rgb(var(--primary-500) / <alpha-value>)` supports opacity modifiers.
 *
 * @param palette - The scale to render
 * @returns A single-line `:root{...}` rule
 */
export function paletteToCssVars(palette: PrimaryPalette): string {
  const declarations = PRIMARY_SHADES.map((shade) => {
    const { r, g, b } = hexToRgb(palette[shade]);
    return `--primary-${shade}:${r} ${g} ${b};`;
  }).join("");
  return `:root{${declarations}}`;
}

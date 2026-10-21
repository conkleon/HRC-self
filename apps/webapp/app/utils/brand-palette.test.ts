import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIMARY_COLOR,
  generatePrimaryPalette,
  normalizeHexColor,
  paletteToCssVars,
  PRIMARY_SHADES,
} from "./brand-palette";
import { getLuminance, hexToRgb } from "./color-contrast";

const luminance = (hex: string) => getLuminance(hexToRgb(hex));

describe("generatePrimaryPalette", () => {
  it("reproduces the Shelf palette exactly for the default color", () => {
    expect(generatePrimaryPalette(DEFAULT_PRIMARY_COLOR)).toEqual({
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
    });
  });

  it("keeps 500 to 700 equal to the brand color", () => {
    const palette = generatePrimaryPalette("#C8102E");
    expect([palette[500], palette[600], palette[700]]).toEqual([
      "#C8102E",
      "#C8102E",
      "#C8102E",
    ]);
  });

  it("gets lighter toward 25 and darker toward 900", () => {
    const palette = generatePrimaryPalette("#C8102E");
    const lighter = [25, 50, 100, 200, 300, 400, 500] as const;
    for (let i = 1; i < lighter.length; i++) {
      expect(luminance(palette[lighter[i - 1]])).toBeGreaterThan(
        luminance(palette[lighter[i]])
      );
    }
    expect(luminance(palette[700])).toBeGreaterThan(luminance(palette[800]));
    expect(luminance(palette[800])).toBeGreaterThan(luminance(palette[900]));
  });
});

describe("normalizeHexColor", () => {
  it("normalizes short, missing-# and lowercase hex", () => {
    expect(normalizeHexColor("abc")).toBe("#AABBCC");
    expect(normalizeHexColor("#c8102e")).toBe("#C8102E");
    expect(normalizeHexColor(" C8102E ")).toBe("#C8102E");
  });

  it("rejects non-hex input", () => {
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });
});

describe("paletteToCssVars", () => {
  it("emits space-separated RGB channels per shade", () => {
    const css = paletteToCssVars(generatePrimaryPalette(DEFAULT_PRIMARY_COLOR));
    expect(css).toContain("--primary-500:239 104 32;");
    expect(css).toContain("--primary-25:254 250 245;");
    expect(css.startsWith(":root{")).toBe(true);
    for (const shade of PRIMARY_SHADES) {
      expect(css).toContain(`--primary-${shade}:`);
    }
  });
});

describe("global.css defaults", () => {
  it("declares the same default --primary-* channels the generator emits", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "../styles/global.css"),
      "utf8"
    );
    const generated = paletteToCssVars(
      generatePrimaryPalette(DEFAULT_PRIMARY_COLOR)
    );
    for (const shade of PRIMARY_SHADES) {
      const declaration = generated.match(
        new RegExp(`--primary-${shade}:[^;]+;`)
      )?.[0];
      expect(css.replace(/:\s+/g, ":")).toContain(declaration);
    }
  });
});

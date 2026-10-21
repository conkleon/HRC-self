/**
 * The accent color is configurable, so app code must reach Shelf's orange only
 * through `primary-*` classes, `rgb(var(--primary-N))` or
 * `config.emailPrimaryColor`. A hardcoded shade stays orange on a rebranded
 * instance. `brand-palette.ts` and `global.css` define the defaults and are the
 * only allowed homes for these values.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generatePrimaryPalette, DEFAULT_PRIMARY_COLOR } from "./brand-palette";

const APP = path.resolve(__dirname, "..");
const ALLOWED = new Set([
  path.join(APP, "utils", "brand-palette.ts"),
  path.join(APP, "styles", "global.css"),
]);

/** Every non-test source file under `app/`. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [full]
      : [];
  });
}

describe("Shelf orange is never hardcoded", () => {
  it("leaves the default primary shades to brand-palette.ts and global.css", () => {
    const shades = [
      ...new Set(Object.values(generatePrimaryPalette(DEFAULT_PRIMARY_COLOR))),
    ];
    const pattern = new RegExp(shades.join("|"), "i");
    const offending = sourceFiles(APP)
      .filter((file) => !ALLOWED.has(file))
      .flatMap((file) =>
        fs
          .readFileSync(file, "utf8")
          .split("\n")
          .map((line, index) => ({ file, line: index + 1, text: line }))
          .filter(({ text }) => pattern.test(text))
          .map(({ file, line }) => `${path.relative(APP, file)}:${line}`)
      );
    expect(offending).toEqual([]);
  });
});

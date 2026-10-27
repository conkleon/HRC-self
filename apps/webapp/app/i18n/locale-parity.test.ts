/**
 * Every language must translate exactly the English keys, with the same
 * interpolation placeholders. A missing key would silently show English, an
 * extra one is dead text, and a dropped `{{count}}` shows the wrong number.
 */

import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./config";
import { resources } from "./resources";

/** Flattens nested resources into `a.b.c` keys with their string values. */
function flatten(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") {
    out.set(prefix, node);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [k, v] of flatten(value, path)) out.set(k, v);
    }
  }
  return out;
}

/**
 * The `{{name}}` placeholders and `<tag>` markers in a string, sorted. Tags
 * are the `<Trans>` component slots, which must survive translation too.
 */
function placeholders(text: string): string[] {
  const values = [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map(
    (match) => match[1]
  );
  const tags = [...text.matchAll(/<\/?(\w+)>/g)].map((match) => match[0]);
  return [...values, ...tags].sort();
}

const english = flatten(resources.en.translation);

describe.each(SUPPORTED_LOCALES.filter((locale) => locale !== "en"))(
  "%s translation",
  (locale) => {
    const translated = flatten(resources[locale].translation);

    it("has every English key", () => {
      const missing = [...english.keys()].filter((key) => !translated.has(key));
      expect(missing).toEqual([]);
    });

    it("has no keys English lacks", () => {
      const extra = [...translated.keys()].filter((key) => !english.has(key));
      expect(extra).toEqual([]);
    });

    it("keeps every placeholder and component tag", () => {
      const mismatched = [...english].filter(
        ([key, text]) =>
          translated.has(key) &&
          placeholders(text).join() !==
            placeholders(translated.get(key)!).join()
      );
      expect(mismatched.map(([key]) => key)).toEqual([]);
    });

    it("leaves no value empty", () => {
      const empty = [...translated].filter(([, text]) => !text.trim());
      expect(empty.map(([key]) => key)).toEqual([]);
    });
  }
);

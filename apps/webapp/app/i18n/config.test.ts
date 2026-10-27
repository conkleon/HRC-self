import { describe, expect, it } from "vitest";
import { isSupportedLocale, resolveLocale } from "./config";

describe("resolveLocale", () => {
  it("prefers the user's own choice", () => {
    expect(resolveLocale({ userLocale: "en", instanceDefault: "el" })).toBe(
      "en"
    );
  });

  it("follows the instance default when the user has not chosen", () => {
    expect(resolveLocale({ userLocale: null, instanceDefault: "el" })).toBe(
      "el"
    );
  });

  it("normalises the instance default", () => {
    expect(resolveLocale({ instanceDefault: " EL " })).toBe("el");
  });

  it("ignores unsupported values and falls back to English", () => {
    expect(resolveLocale({ userLocale: "fr", instanceDefault: "de" })).toBe(
      "en"
    );
    expect(resolveLocale({})).toBe("en");
  });
});

describe("isSupportedLocale", () => {
  it("accepts shipped languages only", () => {
    expect(isSupportedLocale("el")).toBe(true);
    expect(isSupportedLocale("EL")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { resolveAppHost, resolveBrandingFiles } from "./instance-branding";

describe("resolveBrandingFiles", () => {
  it("picks the first extension in priority order", () => {
    expect(
      resolveBrandingFiles(["icon.jpg", "icon.png", "login-bg.webp"])
    ).toEqual({ icon: "icon.png", "login-bg": "login-bg.webp" });
  });

  it("finds an optional favicon.ico", () => {
    expect(resolveBrandingFiles(["favicon.ico"])).toEqual({
      favicon: "favicon.ico",
    });
  });

  it("ignores unknown files", () => {
    expect(resolveBrandingFiles(["logo.png", ".env", "icon.gif"])).toEqual({});
  });
});

describe("resolveAppHost", () => {
  it("returns the host of the server URL", () => {
    expect(resolveAppHost("https://assets.example.org")).toBe(
      "assets.example.org"
    );
  });

  it("keeps a non-default port", () => {
    expect(resolveAppHost("http://localhost:3000")).toBe("localhost:3000");
  });

  it("falls back to shelf.nu when the URL is missing or invalid", () => {
    expect(resolveAppHost(undefined)).toBe("shelf.nu");
    expect(resolveAppHost("not a url")).toBe("shelf.nu");
  });
});

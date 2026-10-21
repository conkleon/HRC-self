import { describe, expect, it } from "vitest";
import { resolveBrandingFiles } from "./instance-branding";

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

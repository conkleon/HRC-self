import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * env.ts reads `process.env` when it is imported, and the branding module
 * memoizes its result, so each test stubs env and imports a fresh copy.
 */
async function loadBranding(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value ?? "");
  }
  vi.resetModules();
  const { Logger } = await import("~/utils/logger");
  // why: the contrast and invalid-color warnings are observable only as log output
  const warn = vi.spyOn(Logger, "warn").mockImplementation(() => undefined);
  const mod = await import("./instance-branding.server");
  return { ...mod, warn };
}

let dir: string;

beforeAll(async () => {
  // Transforming the import graph once up front keeps the per-test fresh
  // imports fast; the first cold import alone can exceed the test timeout.
  await import("./instance-branding.server");
}, 60_000);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "branding-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const unset = {
  APP_NAME: undefined,
  INSTANCE_NAME: undefined,
  BRAND_PRIMARY_COLOR: undefined,
  BRANDING_DIR: undefined,
};

describe("getInstanceBranding", () => {
  it("returns Shelf defaults when nothing is set", async () => {
    const { getInstanceBranding } = await loadBranding(unset);
    expect(getInstanceBranding()).toMatchObject({
      appName: "Shelf",
      instanceName: null,
      primaryColor: "#EF6820",
      iconUrl: "/static/images/shelf-symbol.png",
      faviconUrl: "/static/favicon.ico",
      loginBgUrl: null,
      hasCustomIcon: false,
    });
  });

  it("returns Shelf defaults when BRANDING_DIR does not exist", async () => {
    const { getInstanceBranding } = await loadBranding({
      ...unset,
      BRANDING_DIR: path.join(dir, "missing"),
    });
    expect(getInstanceBranding()).toMatchObject({
      iconUrl: "/static/images/shelf-symbol.png",
      loginBgUrl: null,
      hasCustomIcon: false,
    });
  });

  it("serves custom files and uses the icon as favicon when favicon.ico is absent", async () => {
    fs.writeFileSync(path.join(dir, "icon.png"), "png");
    fs.writeFileSync(path.join(dir, "login-bg.jpg"), "jpg");
    const { getInstanceBranding } = await loadBranding({
      ...unset,
      BRANDING_DIR: dir,
    });
    expect(getInstanceBranding()).toMatchObject({
      iconUrl: "/branding/icon.png",
      faviconUrl: "/branding/icon.png",
      loginBgUrl: "/branding/login-bg.jpg",
      hasCustomIcon: true,
    });
  });

  it("prefers favicon.ico for the favicon when present", async () => {
    fs.writeFileSync(path.join(dir, "icon.png"), "png");
    fs.writeFileSync(path.join(dir, "favicon.ico"), "ico");
    const { getInstanceBranding } = await loadBranding({
      ...unset,
      BRANDING_DIR: dir,
    });
    expect(getInstanceBranding().faviconUrl).toBe("/branding/favicon.ico");
  });

  it("shows the instance name only when it differs from the app name", async () => {
    const same = await loadBranding({
      ...unset,
      APP_NAME: "HRC Assets",
      INSTANCE_NAME: "HRC Assets",
    });
    expect(same.getInstanceBranding().instanceName).toBeNull();

    const different = await loadBranding({
      ...unset,
      APP_NAME: "HRC Assets",
      INSTANCE_NAME: "HRC Patras",
    });
    expect(different.getInstanceBranding()).toMatchObject({
      appName: "HRC Assets",
      instanceName: "HRC Patras",
    });
  });

  it("falls back to the default color and warns on invalid input", async () => {
    const { getInstanceBranding, warn } = await loadBranding({
      ...unset,
      BRAND_PRIMARY_COLOR: "red",
    });
    expect(getInstanceBranding().primaryColor).toBe("#EF6820");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("BRAND_PRIMARY_COLOR")
    );
  });

  it("uses a valid brand color for the color and CSS variables", async () => {
    const { getInstanceBranding } = await loadBranding({
      ...unset,
      BRAND_PRIMARY_COLOR: "c8102e",
    });
    const branding = getInstanceBranding();
    expect(branding.primaryColor).toBe("#C8102E");
    expect(branding.primaryCssVars).toContain("--primary-500:200 16 46;");
  });

  it("warns when white text on the brand color is below 4.5:1", async () => {
    const { getInstanceBranding, warn } = await loadBranding({
      ...unset,
      BRAND_PRIMARY_COLOR: "#FFD700",
    });
    getInstanceBranding();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("contrast"));
  });

  it("does not warn for the default color", async () => {
    const { getInstanceBranding, warn } = await loadBranding(unset);
    getInstanceBranding();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("getBrandingFilePath", () => {
  it("returns the absolute path of a resolved branding file", async () => {
    fs.writeFileSync(path.join(dir, "icon.png"), "png");
    const { getBrandingFilePath } = await loadBranding({
      ...unset,
      BRANDING_DIR: dir,
    });
    expect(getBrandingFilePath("icon.png")).toBe(path.join(dir, "icon.png"));
  });

  it("never returns a path for a name outside the resolved files", async () => {
    fs.writeFileSync(path.join(dir, "icon.png"), "png");
    fs.writeFileSync(path.join(dir, "logo.png"), "png");
    const { getBrandingFilePath } = await loadBranding({
      ...unset,
      BRANDING_DIR: dir,
    });
    expect(getBrandingFilePath("logo.png")).toBeNull();
    expect(getBrandingFilePath("../.env")).toBeNull();
    expect(getBrandingFilePath("icon.jpg")).toBeNull();
  });

  it("returns null when BRANDING_DIR is unset", async () => {
    const { getBrandingFilePath } = await loadBranding(unset);
    expect(getBrandingFilePath("icon.png")).toBeNull();
  });
});

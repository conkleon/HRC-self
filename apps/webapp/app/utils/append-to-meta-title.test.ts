import { afterEach, describe, expect, it, vi } from "vitest";

/** env.ts reads `process.env` at import, so each case imports a fresh copy. */
async function load(appName: string | undefined) {
  vi.stubEnv("APP_NAME", appName ?? "");
  vi.resetModules();
  return import("./append-to-meta-title");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appendToMetaTitle", () => {
  it("appends Shelf when APP_NAME is unset", async () => {
    const { appendToMetaTitle } = await load(undefined);
    expect(appendToMetaTitle("Assets")).toBe("Assets | Shelf");
  });

  it("appends the configured app name", async () => {
    const { appendToMetaTitle } = await load("HRC Assets");
    expect(appendToMetaTitle("Assets")).toBe("Assets | HRC Assets");
  });

  it("falls back to Not found without a title", async () => {
    const { appendToMetaTitle } = await load("HRC Assets");
    expect(appendToMetaTitle(undefined)).toBe("Not found | HRC Assets");
  });
});

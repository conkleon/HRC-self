import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from "~/modules/branding/instance-branding";
import { loader } from "~/routes/manifest[.webmanifest]";

let branding: InstanceBranding = DEFAULT_INSTANCE_BRANDING;

// why: the real resolver reads env and the branding folder once per process;
// each case here needs a different branding
vi.mock("~/modules/branding/instance-branding.server", () => ({
  getInstanceBranding: () => branding,
}));

const SERVER_ENTRY = path.resolve(__dirname, "../../server/index.ts");

/** Calls the loader and parses the manifest it returns. */
async function getManifest() {
  const response = await loader();
  return {
    response,
    manifest: (await response.json()) as {
      name: string;
      short_name: string;
      icons: { src: string; sizes: string; type: string }[];
    },
  };
}

beforeEach(() => {
  branding = DEFAULT_INSTANCE_BRANDING;
});

describe("/manifest.webmanifest", () => {
  it("keeps Shelf's name and icon when nothing is configured", async () => {
    const { response, manifest } = await getManifest();
    expect(response.headers.get("Content-Type")).toBe(
      "application/manifest+json"
    );
    expect(manifest.name).toBe("Shelf");
    expect(manifest.short_name).toBe("Shelf");
    expect(manifest.icons).toEqual([
      {
        src: "/static/images/shelf-logo-x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ]);
  });

  it("uses the configured app name and icon", async () => {
    branding = {
      ...DEFAULT_INSTANCE_BRANDING,
      appName: "HRC Assets",
      iconUrl: "/branding/icon.jpg",
      hasCustomIcon: true,
    };
    const { manifest } = await getManifest();
    expect(manifest.name).toBe("HRC Assets");
    expect(manifest.short_name).toBe("HRC Assets");
    expect(manifest.icons).toEqual([
      {
        src: "/branding/icon.jpg",
        sizes: "any",
        type: "image/jpeg",
        purpose: "any",
      },
    ]);
  });

  it("is reachable without a session", () => {
    const src = fs.readFileSync(SERVER_ENTRY, "utf8");
    const start = src.indexOf("publicPaths: [");
    const block = src.slice(start, src.indexOf("]", start));
    expect(block).toContain('"/manifest.webmanifest"');
  });
});

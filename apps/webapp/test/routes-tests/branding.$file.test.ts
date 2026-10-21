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

const SERVER_ENTRY = path.resolve(__dirname, "../../server/index.ts");

/** Imports the route fresh so it sees the stubbed `BRANDING_DIR`. */
async function loadRoute(brandingDir: string | undefined) {
  vi.stubEnv("BRANDING_DIR", brandingDir ?? "");
  vi.resetModules();
  return import("~/routes/branding.$file");
}

/** Calls the loader the way react-router does for `/branding/<file>`. */
function request(
  loader: Awaited<ReturnType<typeof loadRoute>>["loader"],
  file: string
) {
  return loader({
    request: new Request(`http://localhost/branding/${file}`),
    params: { file },
    context: {},
  } as unknown as Parameters<typeof loader>[0]);
}

let dir: string;

beforeAll(async () => {
  await import("~/routes/branding.$file");
}, 60_000);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "branding-route-"));
  fs.writeFileSync(path.join(dir, "icon.png"), "png-bytes");
  fs.writeFileSync(path.join(dir, "logo.png"), "png-bytes");
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("/branding/:file", () => {
  it("serves a configured branding file with its content type", async () => {
    const { loader } = await loadRoute(dir);
    const response = await request(loader, "icon.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(await response.text()).toBe("png-bytes");
  });

  it("refuses files outside the branding allowlist", async () => {
    const { loader } = await loadRoute(dir);
    expect((await request(loader, "logo.png")).status).toBe(404);
    expect((await request(loader, "..%2F.env")).status).toBe(404);
    expect((await request(loader, "../.env")).status).toBe(404);
  });

  it("returns 404 when BRANDING_DIR is unset", async () => {
    const { loader } = await loadRoute(undefined);
    expect((await request(loader, "icon.png")).status).toBe(404);
  });

  it("is reachable without a session", () => {
    const src = fs.readFileSync(SERVER_ENTRY, "utf8");
    const start = src.indexOf("publicPaths: [");
    const block = src.slice(start, src.indexOf("]", start));
    expect(block).toContain('"/branding/:file"');
  });
});

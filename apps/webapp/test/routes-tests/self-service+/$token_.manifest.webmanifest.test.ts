// @vitest-environment node
/**
 * Tests for the shortcut manifest of a self-service link: it names the
 * workspace, opens the link it was saved from, and refuses a dead token.
 *
 * @see {@link file://./../../../app/routes/self-service+/$token_.manifest[.webmanifest].ts}
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_INSTANCE_BRANDING } from "~/modules/branding/instance-branding";
import { loader } from "~/routes/self-service+/$token_.manifest[.webmanifest]";
import { ShelfError } from "~/utils/error";

// why: the workspace lookup is a database read
const { mockGetWorkspace } = vi.hoisted(() => ({ mockGetWorkspace: vi.fn() }));
vi.mock("~/modules/self-custody/browse.server", () => ({
  getBrowseWorkspace: mockGetWorkspace,
}));

// why: the real resolver reads env and the branding folder once per process
vi.mock("~/modules/branding/instance-branding.server", () => ({
  getInstanceBranding: () => DEFAULT_INSTANCE_BRANDING,
}));

const SERVER_ENTRY = path.resolve(__dirname, "../../../server/index.ts");

/** Calls the loader for a token. */
function load(token: string) {
  return loader({
    params: { token },
    request: new Request(
      `http://localhost/self-service/${token}/manifest.webmanifest`
    ),
    context: {},
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  mockGetWorkspace.mockReset();
});

describe("/self-service/:token/manifest.webmanifest", () => {
  it("names the workspace and starts at its self-service link", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "org-1", name: "HRC Patras" });

    const response = await load("tok-1");
    const manifest = await response.json();

    expect(mockGetWorkspace).toHaveBeenCalledWith("tok-1");
    expect(response.headers.get("Content-Type")).toBe(
      "application/manifest+json"
    );
    expect(manifest).toMatchObject({
      id: "/self-service/tok-1",
      name: "HRC Patras self-service",
      short_name: "HRC Patras",
      start_url: "/self-service/tok-1",
      scope: "/self-service/tok-1",
      display: "standalone",
    });
    expect(manifest.icons).toHaveLength(1);
  });

  it("answers 404 for a token that names no workspace", async () => {
    mockGetWorkspace.mockRejectedValue(
      new ShelfError({
        cause: null,
        message: "This self-service link is not valid any more.",
        label: "Custody",
        status: 404,
      })
    );

    await expect(load("old-token")).rejects.toMatchObject({
      init: { status: 404 },
    });
  });

  it("is reachable without a session", () => {
    const src = fs.readFileSync(SERVER_ENTRY, "utf8");
    const start = src.indexOf("publicPaths: [");
    const block = src.slice(start, src.indexOf("]", start));
    expect(block).toContain('"/self-service/:token/manifest.webmanifest"');
  });
});

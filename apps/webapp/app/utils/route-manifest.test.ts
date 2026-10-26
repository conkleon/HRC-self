// @vitest-environment node
/**
 * Tests for which manifest a page links.
 *
 * @see {@link file://./route-manifest.ts}
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_MANIFEST_HREF, manifestHrefFor } from "./route-manifest";

describe("manifestHrefFor", () => {
  it("links the app-wide manifest when no route names one", () => {
    expect(
      manifestHrefFor([
        { handle: undefined, params: {} },
        { handle: { breadcrumb: () => null }, params: {} },
      ])
    ).toBe(DEFAULT_MANIFEST_HREF);
  });

  it("links a route's own manifest, built from its params", () => {
    expect(
      manifestHrefFor([
        { handle: undefined, params: {} },
        {
          handle: {
            manifest: ({ token }: { token?: string }) => `/m/${token}`,
          },
          params: { token: "tok-1" },
        },
      ])
    ).toBe("/m/tok-1");
  });

  it("prefers the deepest route that names one", () => {
    expect(
      manifestHrefFor([
        { handle: { manifest: () => "/outer" }, params: {} },
        { handle: { manifest: () => "/inner" }, params: {} },
      ])
    ).toBe("/inner");
  });
});

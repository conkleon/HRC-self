import { render } from "@react-email/components";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from "~/modules/branding/instance-branding";
import type * as EnvModule from "~/utils/env";

let branding: InstanceBranding = DEFAULT_INSTANCE_BRANDING;

// why: the real resolver reads env and the branding folder once per process;
// each case here needs a different branding
vi.mock("~/modules/branding/instance-branding.server", () => ({
  getInstanceBranding: () => branding,
}));

// why: SERVER_URL is read at import time and is not set in the test env
vi.mock("~/utils/env", async (importOriginal) => ({
  ...(await importOriginal<typeof EnvModule>()),
  SERVER_URL: "https://assets.example.org",
}));

import { LogoForEmail } from "./logo";

beforeEach(() => {
  branding = DEFAULT_INSTANCE_BRANDING;
});

describe("LogoForEmail", () => {
  it("shows the Shelf logo by default", async () => {
    const html = await render(<LogoForEmail />);
    expect(html).toContain(
      "https://assets.example.org/static/images/logo-full-color(x2).png"
    );
  });

  it("shows the instance icon and app name when an icon is configured", async () => {
    branding = {
      ...DEFAULT_INSTANCE_BRANDING,
      appName: "HRC Assets",
      iconUrl: "/branding/icon.png",
      hasCustomIcon: true,
    };
    const html = await render(<LogoForEmail />);
    expect(html).toContain("https://assets.example.org/branding/icon.png");
    expect(html).toContain("HRC Assets");
    expect(html).not.toContain("logo-full-color");
  });
});

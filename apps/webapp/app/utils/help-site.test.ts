import { describe, expect, it } from "vitest";
import { helpSiteUrl } from "./help-site";

describe("helpSiteUrl", () => {
  it("joins the path onto the configured base", () => {
    expect(
      helpSiteUrl("/knowledge-base/asset-reminders", "https://help.example.org")
    ).toBe("https://help.example.org/knowledge-base/asset-reminders");
  });

  it("tolerates trailing and leading slashes", () => {
    expect(helpSiteUrl("privacy", "https://help.example.org/")).toBe(
      "https://help.example.org/privacy"
    );
  });

  it("keeps a base path and query strings", () => {
    expect(helpSiteUrl("/?ref=app", "https://example.org/help")).toBe(
      "https://example.org/help/?ref=app"
    );
  });

  it("returns null when no help site is configured", () => {
    expect(helpSiteUrl("/privacy", "")).toBeNull();
    expect(helpSiteUrl("/privacy", "   ")).toBeNull();
  });

  it("returns null for a base that is not a URL", () => {
    expect(helpSiteUrl("/privacy", "help site")).toBeNull();
  });
});

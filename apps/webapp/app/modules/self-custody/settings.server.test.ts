// @vitest-environment node
/**
 * Tests for reading and changing a workspace's self-service custody settings.
 *
 * @see {@link file://./settings.server.ts}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import { verifyPin } from "./pin.server";
import {
  browseLinkUrl,
  getSelfCustodySettings,
  isSelfCustodyEnabled,
  renderBrowseLinkQr,
  rotateSelfCustodyBrowseToken,
  setSelfCustodyEnabled,
  setSelfCustodyPin,
  setSelfCustodyTag,
} from "./settings.server";

// why: unit tests run without a database; these are the only Prisma calls made
vi.mock("~/database/db.server", () => ({
  db: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    tag: { findMany: vi.fn() },
  },
}));

// why: Logger makes external calls
vi.mock("~/utils/logger", () => ({ Logger: { error: vi.fn() } }));

const findUnique = vi.mocked(db.organization.findUnique);
const update = vi.mocked(db.organization.update);
const findTags = vi.mocked(db.tag.findMany);

beforeEach(() => vi.clearAllMocks());

describe("isSelfCustodyEnabled", () => {
  it("reads the workspace switch", async () => {
    findUnique.mockResolvedValue({ selfCustodyEnabled: true } as never);
    await expect(isSelfCustodyEnabled("org-1")).resolves.toBe(true);
  });

  it("answers false for an unknown workspace or a failed read", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(isSelfCustodyEnabled("org-x")).resolves.toBe(false);
    findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(isSelfCustodyEnabled("org-1")).resolves.toBe(false);
  });
});

describe("getSelfCustodySettings", () => {
  it("reports whether a PIN is set, never the hash", async () => {
    const changed = new Date("2026-10-01");
    findUnique.mockResolvedValue({
      selfCustodyEnabled: true,
      selfCustodyPinHash: "scrypt$aa$bb",
      selfCustodyPinUpdatedAt: changed,
      selfCustodyTagId: "tag-ss",
      selfCustodyBrowseToken: "tok",
    } as never);

    const settings = await getSelfCustodySettings("org-1");

    expect(settings).toEqual({
      enabled: true,
      hasPin: true,
      pinUpdatedAt: changed,
      tagId: "tag-ss",
      browseToken: "tok",
    });
    expect(JSON.stringify(settings)).not.toContain("scrypt");
  });
});

describe("setSelfCustodyEnabled", () => {
  it("refuses to enable without a PIN", async () => {
    findUnique.mockResolvedValue({ selfCustodyPinHash: null } as never);
    await expect(
      setSelfCustodyEnabled({ organizationId: "org-1", enabled: true })
    ).rejects.toMatchObject({ status: 400, message: "Set a PIN first." });
    expect(update).not.toHaveBeenCalled();
  });

  it("enables once a PIN is set, and always allows turning it off", async () => {
    findUnique.mockResolvedValue({
      selfCustodyPinHash: "scrypt$aa$bb",
    } as never);
    await setSelfCustodyEnabled({ organizationId: "org-1", enabled: true });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyEnabled: true },
    });

    findUnique.mockResolvedValue({ selfCustodyPinHash: null } as never);
    await setSelfCustodyEnabled({ organizationId: "org-1", enabled: false });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyEnabled: false },
    });
  });
});

describe("setSelfCustodyPin", () => {
  it("stores a hash, never the PIN, and bumps the PIN version", async () => {
    await setSelfCustodyPin({ organizationId: "org-1", pin: "4821" });

    const { data } = update.mock.calls[0][0] as {
      data: { selfCustodyPinHash: string; selfCustodyPinUpdatedAt: Date };
    };
    expect(data.selfCustodyPinHash.startsWith("scrypt$")).toBe(true);
    // The hash is random hex and may contain the digits by chance; no stored
    // value may be the PIN itself.
    expect(Object.values(data)).not.toContain("4821");
    expect(data.selfCustodyPinUpdatedAt).toBeInstanceOf(Date);
    await expect(verifyPin("4821", data.selfCustodyPinHash)).resolves.toBe(
      true
    );
  });
});

describe("setSelfCustodyTag", () => {
  it("stores a tag of this workspace", async () => {
    findTags.mockResolvedValue([{ id: "tag-ss" }] as never);
    await setSelfCustodyTag({ organizationId: "org-1", tagId: "tag-ss" });

    expect(findTags).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tag-ss"] }, organizationId: "org-1" },
      })
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyTagId: "tag-ss" },
    });
  });

  it("refuses a tag of another workspace", async () => {
    findTags.mockResolvedValue([]);
    await expect(
      setSelfCustodyTag({ organizationId: "org-1", tagId: "tag-other" })
    ).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it("clears the tag without a lookup", async () => {
    await setSelfCustodyTag({ organizationId: "org-1", tagId: null });
    expect(findTags).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyTagId: null },
    });
  });
});

describe("rotateSelfCustodyBrowseToken", () => {
  it("stores a new unguessable, URL-safe token each time", async () => {
    const first = await rotateSelfCustodyBrowseToken("org-1");
    const second = await rotateSelfCustodyBrowseToken("org-1");

    expect(first).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(second).not.toBe(first);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyBrowseToken: second },
    });
  });
});

describe("browse link", () => {
  it("points at the browse page and renders as a PNG QR code", async () => {
    const url = browseLinkUrl("tok");
    expect(url).toMatch(/\/self-service\/tok$/);
    await expect(renderBrowseLinkQr(url)).resolves.toMatch(
      /^data:image\/png;base64,/
    );
  });
});

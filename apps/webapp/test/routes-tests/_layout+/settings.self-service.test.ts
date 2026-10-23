// @vitest-environment node
/**
 * Settings > Self-service: who may open it, and how the switch, the PIN and
 * the browse list's offer (tag and locations) and link are saved. The permission mock answers from the real matrix for the role
 * under test; the settings service runs for real on a stubbed database.
 *
 * @see {@link file://../../../app/routes/_layout+/settings.self-service.tsx}
 */
import { OrganizationRoles } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionContext } from "@helpers/role-access";
import { createActionArgs, createLoaderArgs } from "@mocks/remix";

import { db } from "~/database/db.server";
import { action, loader } from "~/routes/_layout+/settings.self-service";
import { ShelfError } from "~/utils/error";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { requirePermission } from "~/utils/roles.server";

// why: permission resolution reads the membership from the database; the mock
// answers from the real matrix for the role under test instead.
vi.mock("~/utils/roles.server", () => ({ requirePermission: vi.fn() }));

// why: unit tests run without a database; these are the only Prisma calls made
vi.mock("~/database/db.server", () => ({
  db: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    tag: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));

// why: the success toast goes through the server-sent event emitter
vi.mock("~/utils/emitter/send-notification.server", () => ({
  sendNotification: vi.fn(),
}));

const findUnique = vi.mocked(db.organization.findUnique);
const update = vi.mocked(db.organization.update);
const findTags = vi.mocked(db.tag.findMany);
const findLocations = vi.mocked(db.location.findMany);

const context = {
  getSession: () => ({ userId: "user-1" }),
  isAuthenticated: true,
} as never;

function actAs(role: OrganizationRoles) {
  vi.mocked(requirePermission).mockImplementation(
    async ({ entity, action }) => {
      if (!userHasPermission({ roles: [role], entity, action })) {
        throw new ShelfError({
          cause: null,
          message: "You do not have permission to access this resource",
          label: "Permission",
          status: 403,
          shouldBeCaptured: false,
        });
      }
      return permissionContext({ roles: [role] }) as never;
    }
  );
}

/** A form post; pass pairs to repeat a field, as ticked checkboxes do. */
const post = (fields: Record<string, string> | [string, string][]) =>
  createActionArgs({
    request: new Request("http://localhost/settings/self-service", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
    context,
  });

/** Status of a `data(...)` result or a thrown one. */
async function statusOf(run: () => Promise<unknown>) {
  try {
    const result = (await run()) as { init?: { status?: number } } | Response;
    return result instanceof Response
      ? result.status
      : result?.init?.status ?? 200;
  } catch (thrown) {
    return (thrown as { init?: { status?: number } }).init?.status;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  actAs(OrganizationRoles.ADMIN);
  findUnique.mockResolvedValue({
    selfCustodyEnabled: false,
    selfCustodyPinHash: null,
    selfCustodyPinUpdatedAt: null,
    selfCustodyTagId: null,
    selfCustodyLocations: [],
    selfCustodyBrowseToken: null,
  } as never);
  findTags.mockResolvedValue([]);
  findLocations.mockResolvedValue([]);
});

describe("Settings > Self-service", () => {
  it("a Base user gets 403", async () => {
    actAs(OrganizationRoles.BASE);
    await expect(
      statusOf(() =>
        loader(
          createLoaderArgs({
            request: new Request("http://localhost/settings/self-service"),
            context,
          })
        )
      )
    ).resolves.toBe(403);
    await expect(
      statusOf(() => action(post({ intent: "toggle", enabled: "on" })))
    ).resolves.toBe(403);
  });

  it("a Manager cannot change it either", async () => {
    actAs(OrganizationRoles.MANAGER);
    await expect(
      statusOf(() =>
        action(post({ intent: "set-pin", pin: "4821", confirmPin: "4821" }))
      )
    ).resolves.toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to enable without a PIN", async () => {
    await expect(
      statusOf(() => action(post({ intent: "toggle", enabled: "on" })))
    ).resolves.toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("stores a hash, never the PIN", async () => {
    await action(post({ intent: "set-pin", pin: "4821", confirmPin: "4821" }));
    // The hash is random hex, so it may contain the PIN's digits by chance;
    // what must hold is that no stored field is the PIN itself.
    const { data } = update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(data)).not.toContain("pin");
    expect(Object.values(data)).not.toContain("4821");
    expect(data.selfCustodyPinHash).toMatch(/^scrypt\$/);
  });

  it("rejects mismatched PIN confirmation", async () => {
    await expect(
      statusOf(() =>
        action(post({ intent: "set-pin", pin: "4821", confirmPin: "4822" }))
      )
    ).resolves.toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a PIN that is not 4 to 8 digits", async () => {
    await expect(
      statusOf(() =>
        action(post({ intent: "set-pin", pin: "12a", confirmPin: "12a" }))
      )
    ).resolves.toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("turns self-service off without needing a PIN", async () => {
    await action(post({ intent: "toggle" }));
    expect(update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyEnabled: false },
    });
  });

  it("shows the tags, the locations, and the browse link with its QR code once one exists", async () => {
    findUnique.mockResolvedValue({
      selfCustodyEnabled: true,
      selfCustodyPinHash: "scrypt$aa$bb",
      selfCustodyPinUpdatedAt: new Date("2026-10-01"),
      selfCustodyTagId: "tag-ss",
      selfCustodyLocations: [{ id: "loc-depot" }],
      selfCustodyBrowseToken: "tok-1",
    } as never);
    findTags.mockResolvedValue([
      { id: "tag-v", name: "Vehicles" },
      { id: "tag-ss", name: "Self-service" },
    ] as never);
    findLocations.mockResolvedValue([
      { id: "loc-shelf", name: "Shelf A", parentId: "loc-depot" },
      { id: "loc-depot", name: "Depot", parentId: null },
    ] as never);

    const result = (await loader(
      createLoaderArgs({
        request: new Request("http://localhost/settings/self-service"),
        context,
      })
    )) as Record<string, any>;

    expect(result.settings.tagId).toBe("tag-ss");
    expect(result.settings.locationIds).toEqual(["loc-depot"]);
    expect(result.locations).toEqual([
      { id: "loc-depot", name: "Depot", depth: 0 },
      { id: "loc-shelf", name: "Shelf A", depth: 1 },
    ]);
    expect(result.tags).toEqual([
      { id: "tag-ss", name: "Self-service" },
      { id: "tag-v", name: "Vehicles" },
    ]);
    expect(result.browseUrl).toMatch(/\/self-service\/tok-1$/);
    expect(result.browseQr).toMatch(/^data:image\/png;base64,/);
  });

  it("has no link or QR code until one is created", async () => {
    const result = (await loader(
      createLoaderArgs({
        request: new Request("http://localhost/settings/self-service"),
        context,
      })
    )) as Record<string, any>;
    expect(result.browseUrl).toBeNull();
    expect(result.browseQr).toBeNull();
  });

  it("saves a tag of this workspace and refuses one of another", async () => {
    findTags.mockResolvedValue([{ id: "tag-ss" }] as never);
    await action(post({ intent: "set-offer", tagId: "tag-ss" }));
    expect(update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyTagId: "tag-ss", selfCustodyLocations: { set: [] } },
    });

    update.mockClear();
    findTags.mockResolvedValue([]);
    await expect(
      statusOf(() => action(post({ intent: "set-offer", tagId: "tag-other" })))
    ).resolves.toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves every ticked location with the tag", async () => {
    findTags.mockResolvedValue([{ id: "tag-ss" }] as never);
    findLocations.mockResolvedValue([
      { id: "loc-depot" },
      { id: "loc-van" },
    ] as never);

    await action(
      post([
        ["intent", "set-offer"],
        ["tagId", "tag-ss"],
        ["locationIds", "loc-depot"],
        ["locationIds", "loc-van"],
      ])
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {
        selfCustodyTagId: "tag-ss",
        selfCustodyLocations: {
          set: [{ id: "loc-depot" }, { id: "loc-van" }],
        },
      },
    });
  });

  it("refuses a location of another workspace", async () => {
    findLocations.mockResolvedValue([] as never);
    await expect(
      statusOf(() =>
        action(
          post([
            ["intent", "set-offer"],
            ["locationIds", "loc-other-org"],
          ])
        )
      )
    ).resolves.toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("clears the tag and the locations with nothing chosen", async () => {
    await action(post({ intent: "set-offer", tagId: "" }));
    expect(update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { selfCustodyTagId: null, selfCustodyLocations: { set: [] } },
    });
  });

  it("creates or replaces the browse link", async () => {
    await action(post({ intent: "rotate-link" }));
    const { data } = update.mock.calls[0][0] as {
      data: { selfCustodyBrowseToken: string };
    };
    expect(data.selfCustodyBrowseToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it("a Manager can neither choose the offer nor replace the link", async () => {
    actAs(OrganizationRoles.MANAGER);
    await expect(
      statusOf(() => action(post({ intent: "set-offer", tagId: "tag-ss" })))
    ).resolves.toBe(403);
    await expect(
      statusOf(() => action(post({ intent: "rotate-link" })))
    ).resolves.toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});

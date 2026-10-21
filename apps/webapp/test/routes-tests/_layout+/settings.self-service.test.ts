// @vitest-environment node
/**
 * Settings > Self-service: who may open it, and how the switch and the PIN
 * are saved. The permission mock answers from the real matrix for the role
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
  db: { organization: { findUnique: vi.fn(), update: vi.fn() } },
}));

// why: the success toast goes through the server-sent event emitter
vi.mock("~/utils/emitter/send-notification.server", () => ({
  sendNotification: vi.fn(),
}));

const findUnique = vi.mocked(db.organization.findUnique);
const update = vi.mocked(db.organization.update);

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

const post = (fields: Record<string, string>) =>
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
  } as never);
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
    const payload = JSON.stringify(update.mock.calls[0][0]);
    expect(payload).not.toContain('"pin"');
    expect(payload).not.toContain("4821");
    expect(payload).toContain("scrypt$");
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
});

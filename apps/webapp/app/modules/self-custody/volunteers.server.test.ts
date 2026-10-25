// @vitest-environment node
/**
 * Tests for volunteer lookup on the self-service page: searching the
 * workspace's NRMs and adding a volunteer who is not on the list.
 *
 * @see {@link file://./volunteers.server.ts}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import {
  NewVolunteerSchema,
  VolunteerNameSchema,
  findOrCreateVolunteer,
  getVolunteer,
  normalizeVolunteerName,
  searchVolunteers,
} from "./volunteers.server";

// why: unit tests run without a database; these are the only Prisma calls the
// volunteer lookups may make (`update` is listed so a test can prove it never runs)
vi.mock("~/database/db.server", () => ({
  db: {
    teamMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const findMany = vi.mocked(db.teamMember.findMany);
const findFirst = vi.mocked(db.teamMember.findFirst);
const create = vi.mocked(db.teamMember.create);

describe("normalizeVolunteerName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeVolunteerName("  Maria   P.  ")).toBe("Maria P.");
  });
});

describe("VolunteerNameSchema", () => {
  it("rejects a 1-character and a 61-character name", () => {
    for (const name of ["M", "x".repeat(61)]) {
      const result = VolunteerNameSchema.safeParse(name);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Enter your name (2 to 60 characters)"
      );
    }
  });

  it("accepts a name and returns it normalized", () => {
    expect(VolunteerNameSchema.parse("  Νίκος   Π. ")).toBe("Νίκος Π.");
  });
});

describe("searchVolunteers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns nothing for fewer than 3 characters", async () => {
    await expect(
      searchVolunteers({ organizationId: "org-1", query: " Ma " })
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("queries only NRMs of the workspace and caps at 10", async () => {
    findMany.mockResolvedValue([{ id: "tm-1", name: "Maria P." }] as never);

    const result = await searchVolunteers({
      organizationId: "org-1",
      query: "  mar ",
    });

    expect(result).toEqual([{ id: "tm-1", name: "Maria P." }]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: null,
        deletedAt: null,
        name: { contains: "mar", mode: "insensitive" },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 10,
    });
  });
});

describe("getVolunteer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads only a live NRM of the workspace, so a forged id reads as nobody", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      getVolunteer({ organizationId: "org-1", teamMemberId: "tm-other" })
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: null,
        deletedAt: null,
        id: "tm-other",
      },
      select: { id: true, name: true },
    });
  });
});

describe("findOrCreateVolunteer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses an existing NRM regardless of case and spacing", async () => {
    findFirst.mockResolvedValue({ id: "tm-1", name: "Maria P." } as never);

    const result = await findOrCreateVolunteer({
      organizationId: "org-1",
      name: " maria  p. ",
    });

    expect(result).toEqual({ id: "tm-1", name: "Maria P.", created: false });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: null,
        deletedAt: null,
        name: { equals: "maria p.", mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a new NRM in the workspace when none matches", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "tm-2", name: "Giorgos K." } as never);

    const result = await findOrCreateVolunteer({
      organizationId: "org-1",
      name: "Giorgos   K.",
    });

    expect(result).toEqual({ id: "tm-2", name: "Giorgos K.", created: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Giorgos K.",
          organization: { connect: { id: "org-1" } },
        }),
      })
    );
  });

  it("stores the email on a volunteer it creates", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "tm-3", name: "Eleni" } as never);

    await findOrCreateVolunteer({
      organizationId: "org-1",
      name: "Eleni",
      email: "eleni@example.com",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "eleni@example.com" }),
      })
    );
  });

  it("never writes a typed email onto an existing volunteer", async () => {
    findFirst.mockResolvedValue({ id: "tm-1", name: "Maria P." } as never);

    const result = await findOrCreateVolunteer({
      organizationId: "org-1",
      name: "Maria P.",
      email: "someone-else@example.com",
    });

    expect(result).toEqual({ id: "tm-1", name: "Maria P.", created: false });
    expect(create).not.toHaveBeenCalled();
    expect(db.teamMember.update).not.toHaveBeenCalled();
    expect(db.teamMember.updateMany).not.toHaveBeenCalled();
  });
});

describe("NewVolunteerSchema", () => {
  it("treats a blank email as no email", () => {
    expect(NewVolunteerSchema.parse({ name: "Eleni", email: "  " })).toEqual({
      name: "Eleni",
      email: undefined,
    });
    expect(NewVolunteerSchema.parse({ name: "Eleni" }).email).toBeUndefined();
  });

  it("trims and lowercases a typed email", () => {
    expect(
      NewVolunteerSchema.parse({ name: "Eleni", email: " Eleni@Example.COM " })
        .email
    ).toBe("eleni@example.com");
  });

  it("rejects an invalid email", () => {
    const result = NewVolunteerSchema.safeParse({
      name: "Eleni",
      email: "eleni@",
    });
    expect(result.success).toBe(false);
  });
});

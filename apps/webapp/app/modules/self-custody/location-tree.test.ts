/**
 * Widening chosen locations to their sub-locations, and ordering the tree for
 * the self-service settings checklist.
 *
 * @see {@link file://./location-tree.ts}
 */
import { describe, expect, it } from "vitest";
import { expandLocationIds, orderLocationTree } from "./location-tree";

/**
 *   Depot
 *     Shelf A
 *       Bin 1
 *     Shelf B
 *   Van
 */
const TREE = [
  { id: "bin1", name: "Bin 1", parentId: "shelfA" },
  { id: "van", name: "Van", parentId: null },
  { id: "shelfB", name: "Shelf B", parentId: "depot" },
  { id: "depot", name: "Depot", parentId: null },
  { id: "shelfA", name: "Shelf A", parentId: "depot" },
];

describe("expandLocationIds", () => {
  it("adds every location below a chosen one, at any depth", () => {
    expect(expandLocationIds(["depot"], TREE).sort()).toEqual(
      ["bin1", "depot", "shelfA", "shelfB"].sort()
    );
  });

  it("leaves the parent and siblings of a chosen sub-location out", () => {
    expect(expandLocationIds(["shelfA"], TREE).sort()).toEqual(
      ["bin1", "shelfA"].sort()
    );
  });

  it("lists each location once when a parent and its child are both chosen", () => {
    const ids = expandLocationIds(["depot", "shelfA"], TREE);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("drops a chosen location that no longer exists", () => {
    expect(expandLocationIds(["deleted", "van"], TREE)).toEqual(["van"]);
  });

  it("stops on a cycle instead of looping", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(expandLocationIds(["a"], cyclic).sort()).toEqual(["a", "b"]);
  });

  it("is empty when nothing is chosen", () => {
    expect(expandLocationIds([], TREE)).toEqual([]);
  });
});

describe("orderLocationTree", () => {
  it("places each location after its parent, by name, with its depth", () => {
    expect(orderLocationTree(TREE)).toEqual([
      { id: "depot", name: "Depot", depth: 0 },
      { id: "shelfA", name: "Shelf A", depth: 1 },
      { id: "bin1", name: "Bin 1", depth: 2 },
      { id: "shelfB", name: "Shelf B", depth: 1 },
      { id: "van", name: "Van", depth: 0 },
    ]);
  });

  it("treats a location whose parent is missing as a root", () => {
    expect(
      orderLocationTree([{ id: "x", name: "Orphan", parentId: "gone" }])
    ).toEqual([{ id: "x", name: "Orphan", depth: 0 }]);
  });
});

/**
 * Self-Service Location Tree
 *
 * Pure helpers over a workspace's location hierarchy (`Location.parentId`)
 * for the self-service browse list: widening the locations an admin chose to
 * every sub-location below them, and ordering the tree for the settings page.
 * Free of Prisma so both are unit-testable and usable on either side.
 *
 * @see {@link file://./offer.server.ts}
 * @see {@link file://./../../routes/_layout+/settings.self-service.tsx}
 */

/** One location as the hierarchy needs it. */
export type LocationNode = {
  id: string;
  name: string;
  parentId: string | null;
};

/** A location placed in the tree, with how deep it sits (0 for a root). */
export type OrderedLocation = {
  id: string;
  name: string;
  depth: number;
};

/**
 * The chosen locations and every location below them.
 *
 * Ids that are not in `locations` (a location deleted meanwhile) are dropped.
 * A cycle in the hierarchy cannot loop: each location is visited once.
 *
 * @param rootIds - The locations an admin chose
 * @param locations - Every location of the workspace
 * @returns The chosen ids and all their descendants, each once
 */
export function expandLocationIds(
  rootIds: string[],
  locations: Pick<LocationNode, "id" | "parentId">[]
): string[] {
  const childrenOf = new Map<string, string[]>();
  const known = new Set<string>();
  for (const location of locations) {
    known.add(location.id);
    if (location.parentId) {
      const siblings = childrenOf.get(location.parentId) ?? [];
      siblings.push(location.id);
      childrenOf.set(location.parentId, siblings);
    }
  }

  const result = new Set<string>();
  const queue = rootIds.filter((id) => known.has(id));
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return [...result];
}

/**
 * Orders locations depth-first by name, so each one is followed by its
 * sub-locations, for an indented checklist.
 *
 * A location whose parent is missing from `locations` is treated as a root,
 * so nothing is left out of the list.
 *
 * @param locations - Every location of the workspace
 * @returns The locations in tree order, each with its depth
 */
export function orderLocationTree(
  locations: LocationNode[]
): OrderedLocation[] {
  const ids = new Set(locations.map((location) => location.id));
  const byName = (a: LocationNode, b: LocationNode) =>
    a.name.localeCompare(b.name);
  const childrenOf = new Map<string, LocationNode[]>();
  const roots: LocationNode[] = [];
  for (const location of locations) {
    if (location.parentId && ids.has(location.parentId)) {
      const siblings = childrenOf.get(location.parentId) ?? [];
      siblings.push(location);
      childrenOf.set(location.parentId, siblings);
    } else {
      roots.push(location);
    }
  }

  const ordered: OrderedLocation[] = [];
  const visited = new Set<string>();
  const visit = (location: LocationNode, depth: number) => {
    if (visited.has(location.id)) return;
    visited.add(location.id);
    ordered.push({ id: location.id, name: location.name, depth });
    for (const child of (childrenOf.get(location.id) ?? []).sort(byName)) {
      visit(child, depth + 1);
    }
  };
  for (const root of roots.sort(byName)) visit(root, 0);
  return ordered;
}

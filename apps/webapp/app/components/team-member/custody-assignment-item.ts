/**
 * Custody Assignment Item
 *
 * The value format of every "assign custody" team member picker (asset, kit,
 * bulk and scanner). The custody actions parse the id and the resolved display
 * name from one JSON string, and use the name to write the custody note.
 *
 * @see {@link file://./inline-team-member-creation.tsx}
 */
import type { ModelFilterItem } from "~/hooks/use-model-filters";
import { resolveTeamMemberName } from "~/utils/user";

/**
 * Encodes a team member as a custody picker's value.
 *
 * @param item - A team member row from the picker (listed or just created)
 * @returns The item with its id replaced by the `{ id, name }` JSON the custody
 *   actions read; a registered member is named by their display name
 */
export function toCustodyAssignmentItem(
  item: ModelFilterItem
): ModelFilterItem {
  return {
    ...item,
    id: JSON.stringify({ id: item.id, name: resolveTeamMemberName(item) }),
  };
}

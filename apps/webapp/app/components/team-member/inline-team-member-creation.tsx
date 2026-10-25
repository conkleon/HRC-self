/**
 * Inline Team Member Creation
 *
 * The "Create new team member" entry at the bottom of a custodian picker
 * (booking custodian, asset and kit custody). Renders nothing for members who
 * may not create non-registered members, so it can be dropped into any
 * picker's `extraContent` unconditionally; the add-member action enforces the
 * same permission on the server.
 *
 * Items a picker creates bypass its `transformItem`, so the picker passes the
 * same transform here and the new member's value is encoded exactly like the
 * listed ones.
 *
 * @see {@link file://./new-team-member-form.tsx}
 * @see {@link file://./../dynamic-select/dynamic-select.tsx}
 */
import InlineEntityCreationDialog from "~/components/inline-entity-creation-dialog/inline-entity-creation-dialog";
import type { ModelFilterItem } from "~/hooks/use-model-filters";
import { useOrganizationRoles } from "~/hooks/use-organization-roles";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";

/** Props for {@link InlineTeamMemberCreation}. */
type InlineTeamMemberCreationProps = {
  /** From the picker's `extraContent` helpers: adds and selects the new item */
  onItemCreated: (item: ModelFilterItem) => void;
  /** From the picker's `extraContent` helpers */
  closePopover: () => void;
  /** The picker's own `transformItem`, when it has one */
  transformItem?: (item: ModelFilterItem) => ModelFilterItem;
};

/** Lets staff create a non-registered member from inside a custodian picker. */
export function InlineTeamMemberCreation({
  onItemCreated,
  closePopover,
  transformItem,
}: InlineTeamMemberCreationProps) {
  const roles = useOrganizationRoles();
  const canCreate = userHasPermission({
    roles,
    entity: PermissionEntity.nonRegisteredMember,
    action: PermissionAction.create,
  });

  if (!canCreate) return null;

  return (
    <InlineEntityCreationDialog
      title="Create new team member"
      type="teamMember"
      buttonLabel="Create new team member"
      onCreated={(created) => {
        if (created?.type !== "teamMember") return;
        const teamMember = created.entity;
        // `userId` sits on the item itself as well as in `metadata`: the
        // pickers' transforms read it from the top level, like the rows the
        // model-filters endpoint returns.
        const item: ModelFilterItem & { userId: string | null } = {
          id: teamMember.id,
          name: teamMember.name,
          userId: teamMember.userId,
          metadata: { ...teamMember },
        };
        onItemCreated(transformItem ? transformItem(item) : item);
        closePopover();
      }}
    />
  );
}

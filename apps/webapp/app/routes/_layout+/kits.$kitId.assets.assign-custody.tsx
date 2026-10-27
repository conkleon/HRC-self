import type { Prisma } from "@prisma/client";
import {
  AssetStatus,
  BookingStatus,
  KitStatus,
  NoteType,
} from "@prisma/client";
import { kitWithoutActiveAssetsReason } from "@shelf/labels";
import { Trans, useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  redirect,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { Form } from "~/components/custom-form";
import DynamicSelect from "~/components/dynamic-select/dynamic-select";
import { UserIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { WarningBox } from "~/components/shared/warning-box";
import { toCustodyAssignmentItem } from "~/components/team-member/custody-assignment-item";
import { InlineTeamMemberCreation } from "~/components/team-member/inline-team-member-creation";
import { db } from "~/database/db.server";
import { useRoleAccess } from "~/hooks/use-role-access";
import { recordEvents } from "~/modules/activity-event/service.server";
import { lockAssetsForArchiveGuard } from "~/modules/asset/archive-lock.server";
import {
  assertKitsCustodyAssignable,
  assertKitsHaveActiveAssets,
} from "~/modules/booking/kit-holds.server";
import { notifyCustodians } from "~/modules/custody/notify.server";
import { AssignCustodySchema } from "~/modules/custody/schema";
import {
  buildKitCustodyInheritData,
  getKit,
} from "~/modules/kit/service.server";
import { createNotes } from "~/modules/note/service.server";
import { getTeamMember } from "~/modules/team-member/service.server";
import { getUserByID } from "~/modules/user/service.server";
import styles from "~/styles/layout/custom-modal.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { formatUnitCount } from "~/utils/asset-quantity";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import {
  assertIsPost,
  payload,
  error,
  getCurrentSearchParams,
  getParams,
  parseData,
} from "~/utils/http.server";
import {
  wrapUserLinkForNote,
  wrapCustodianForNote,
  wrapLinkForNote,
} from "~/utils/markdoc-wrappers";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { resolveTeamMemberName } from "~/utils/user";

export const meta = () => [{ title: appendToMetaTitle("Assign kit custody") }];

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  const { kitId } = getParams(params, z.object({ kitId: z.string() }), {
    additionalData: {
      userId,
    },
  });

  try {
    const { organizationId, access, userOrganizations } =
      await requirePermission({
        userId,
        request,
        entity: PermissionEntity.kit,
        action: PermissionAction.custody,
      });

    const kit = await getKit({
      id: kitId,
      organizationId,
      extraInclude: {
        assetKits: {
          select: {
            asset: {
              select: {
                status: true,
                // `type` is required so the qty-aware unavailability guard
                // below can skip QUANTITY_TRACKED rows whose row-level
                // status is IN_CUSTODY only because *some* units are
                // operator-allocated (Option B handles that on assign).
                type: true,
                // Archived members are left out of kit custody, so a kit with
                // no active member has nothing to hand over.
                archivedAt: true,
                bookingAssets: {
                  where: {
                    booking: {
                      status: {
                        in: [BookingStatus.RESERVED],
                      },
                      from: { gt: new Date() },
                    },
                  },
                  include: {
                    booking: {
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      userOrganizations,
      request,
    });

    if (kit.custody) {
      return redirect(`/kits/${kitId}`);
    }

    if (!kit.assetKits.some((ak) => !ak.asset.archivedAt)) {
      sendNotification({
        title: "Cannot assign custody at this time.",
        message: kitWithoutActiveAssetsReason({
          hasArchivedAssets: kit.assetKits.length > 0,
          action: "custody",
        }),
        icon: { name: "trash", variant: "error" },
        senderId: userId,
      });

      return redirect(`/kits/${kitId}`);
    }

    /**
     * If any INDIVIDUAL asset is not available in a kit, a kit cannot be
     * assigned custody. QUANTITY_TRACKED assets are exempt: their row-level
     * status may be IN_CUSTODY because some units are operator-allocated,
     * but `buildKitCustodyInheritData` (Option B) computes the remaining
     * pool per asset on assign — partially-allocated assets get the leftover
     * quantity, fully-allocated assets are silently skipped. Same precedent
     * as the manage-assets picker filter in `asset/service.server.ts`.
     */
    const someUnavailableAsset = kit.assetKits.some(
      (ak) =>
        ak.asset.type !== "QUANTITY_TRACKED" && ak.asset.status !== "AVAILABLE"
    );
    if (someUnavailableAsset) {
      sendNotification({
        title: "Cannot assign custody at this time.",
        message: "One of the asset in kit is not available",
        icon: { name: "trash", variant: "error" },
        senderId: userId,
      });

      return redirect(`/kits/${kitId}`);
    }

    const searchParams = getCurrentSearchParams(request);

    const where = {
      deletedAt: null,
      organizationId,
      userId: access.custody.assign === "self" ? userId : undefined,
    } satisfies Prisma.TeamMemberWhereInput;

    const teamMembers = await db.teamMember
      .findMany({
        where,
        include: { user: true },
        orderBy: { userId: "asc" },
        take: searchParams.get("getAll") === "teamMember" ? undefined : 12,
      })
      .catch((cause) => {
        throw new ShelfError({
          cause,
          message:
            "Something went wrong while fetching team members. Please try again or contact support.",
          label: "Kit",
        });
      });

    // A caller whose custody scope is `self` can only take custody for
    // themselves. With no team-member profile in this workspace there is
    // nothing to assign, so short-circuit instead of rendering a dead-end modal
    // whose POST would then fail validation. Normally unreachable (such a
    // caller has their own member row), but an empty team-member list must not
    // crash the modal.
    if (access.custody.assign === "self" && teamMembers.length === 0) {
      sendNotification({
        title: "Cannot take custody",
        message:
          "You don't have a team member profile in this workspace, so custody can't be assigned to you. Please contact your workspace admin.",
        icon: { name: "x", variant: "error" },
        senderId: userId,
      });
      return redirect(`/kits/${kitId}`);
    }

    const totalTeamMembers = await db.teamMember.count({ where });

    return payload({
      showModal: true,
      kit,
      teamMembers,
      totalTeamMembers,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, kitId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  const { kitId } = getParams(params, z.object({ kitId: z.string() }), {
    additionalData: { userId },
  });

  try {
    assertIsPost(request);

    const { access, organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.kit,
      action: PermissionAction.custody,
    });
    const assignsSelfOnly = access.custody.assign === "self";

    const { custodian } = parseData(
      await request.formData(),
      AssignCustodySchema,
      {
        additionalData: { userId, kitId },
        message: "Please select a team member",
      }
    );

    const { id: custodianId, name: custodianName } = custodian;

    const user = await getUserByID(userId, {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
      } satisfies Prisma.UserSelect,
    });

    // Validate that the custodian belongs to the same organization
    const custodianTeamMember = await getTeamMember({
      id: custodianId,
      organizationId,
      select: {
        id: true,
        userId: true,
        name: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    }).catch((cause) => {
      throw new ShelfError({
        cause,
        title: "Team member not found",
        message: "The selected team member could not be found.",
        additionalData: { userId, kitId, custodianId },
        label: "Kit",
        status: 404,
      });
    });

    if (assignsSelfOnly && custodianTeamMember.userId !== user.id) {
      throw new ShelfError({
        cause: null,
        title: "Action not allowed",
        message: "Self user can only assign custody to themselves only.",
        additionalData: { userId, kitId, custodianId },
        label: "Kit",
      });
    }

    // why: awaits inside this $transaction MUST run sequentially. tx.kit.update
    // returns updatedKit.assets which the next two steps consume; Prisma also
    // serializes queries within a transaction, so Promise.all here would
    // provide no benefit and could fragment failure semantics.
    const kit = await db.$transaction(async (tx) => {
      // A kit out on a booking is with its borrower, so it cannot also go to a
      // custodian; re-checked here because the loader's read is not locked.
      await assertKitsCustodyAssignable(tx, {
        kitIds: [kitId],
        organizationId,
      });

      const updatedKit = await tx.kit.update({
        where: { id: kitId, organizationId },
        data: {
          status: KitStatus.IN_CUSTODY,
          custody: { create: { custodian: { connect: { id: custodianId } } } },
        },
        include: {
          // Pull the freshly-created KitCustody row so we can stamp its
          // id onto every asset-side Custody row as `kitCustodyId`. That
          // discriminator distinguishes kit-allocated custody from
          // operator-assigned custody on the same asset.
          custody: { select: { id: true } },
          // Per-asset note phrasing names the qty-tracked unit count
          // ("custody of 50 boxes via Kittington"), so pull the fields
          // `formatUnitCount` needs: type + unitOfMeasure. INDIVIDUAL
          // rows continue to render countless ("custody via Kittington").
          // Archived members are out of service (issue #382) and are left out.
          assetKits: {
            where: { asset: { archivedAt: null } },
            select: {
              asset: {
                // `title` names each member in the custodian's email
                select: {
                  id: true,
                  title: true,
                  type: true,
                  unitOfMeasure: true,
                },
              },
            },
          },
        },
      });

      if (!updatedKit.custody) {
        throw new ShelfError({
          cause: null,
          message: "Failed to create kit custody record.",
          additionalData: { userId, kitId, custodianId },
          label: "Kit",
        });
      }

      const kitCustodyId = updatedKit.custody.id;

      // Build child Custody rows via the shared helper so the
      // remaining-pool rule (qty-tracked rows claim `asset.quantity − already
      // allocated`, fully-allocated assets are skipped) is applied
      // consistently with `updateKitAssets` and `bulkAssignKitCustody`.
      // The archive row lock on the members, so an archive cannot commit
      // between the read above and the custody written below (issue #382).
      // The helper's own read then skips any member archived in between.
      const memberIds = updatedKit.assetKits.map((ak) => ak.asset.id);
      await lockAssetsForArchiveGuard(tx, memberIds, organizationId);
      // A kit whose members are all archived (or that has none) would be in
      // custody while nothing in it is. Read under the lock above.
      await assertKitsHaveActiveAssets(tx, {
        kitIds: [kitId],
        organizationId,
        action: "custody",
      });
      const inheritData = await buildKitCustodyInheritData({
        tx,
        kitId: updatedKit.id,
        kitCustodyId,
        teamMemberId: custodianId,
        assetIds: memberIds,
      });

      if (inheritData.length > 0) {
        await tx.custody.createMany({ data: inheritData });

        const inheritedAssetIds = inheritData.map((row) => row.assetId);
        // `status: { not: CHECKED_OUT }` — a quantity-tracked kit member can
        // hold custody units and booking units at the same time, but
        // `Asset.status` is a single column. Without this guard, taking the
        // kit into custody overwrote `CHECKED_OUT` on a member that still had
        // units out on an ONGOING booking, and every reader of the
        // "is it off the shelf" signal then counted zero checked-out units, so
        // `Available` overstated free stock by exactly the booked quantity.
        // Precedence (`CHECKED_OUT` > `IN_CUSTODY` > `AVAILABLE`) matches
        // `reconcileAssetStatusForBookingExit` and the sibling guards in
        // `kit/service.server.ts` and `asset/service.server.ts`.
        await tx.asset.updateMany({
          where: {
            id: { in: inheritedAssetIds },
            organizationId,
            status: { not: AssetStatus.CHECKED_OUT },
          },
          data: { status: AssetStatus.IN_CUSTODY },
        });

        // Activity events — one CUSTODY_ASSIGNED per asset that received a
        // kit-allocated row. Fully-allocated qty-tracked assets are skipped.
        await recordEvents(
          inheritData.map((row) => ({
            organizationId,
            actorUserId: userId,
            action: "CUSTODY_ASSIGNED",
            entityType: "ASSET",
            entityId: row.assetId,
            assetId: row.assetId,
            kitId: updatedKit.id,
            teamMemberId: custodianId,
            targetUserId: custodianTeamMember.user?.id ?? undefined,
            meta: { viaKit: true, quantity: row.quantity },
          })),
          tx
        );
      }

      return {
        ...updatedKit,
        inheritData,
      };
    });

    // Create notes for all assets using markdoc wrappers (not critical for atomicity)
    const actor = wrapUserLinkForNote({ ...user, id: userId });

    const custodianDisplay = wrapCustodianForNote({
      teamMember: custodianTeamMember,
    });

    const kitLink = wrapLinkForNote(`/kits/${kit.id}`, kit.name);

    // Only notes for assets that actually received a kit-allocated Custody
    // row. Fully operator-allocated qty-tracked assets are skipped.
    // Per-asset content so qty-tracked rows name the actual unit count
    // moved into custody (mirrors the symmetric release-side note
    // "released X's custody of N boxes via kit: Y" and the bulk-assign
    // path in `bulkAssignKitCustody`).
    if (kit.inheritData.length > 0) {
      const assetById = new Map(
        kit.assetKits.map((ak) => [ak.asset.id, ak.asset])
      );
      await Promise.all(
        kit.inheritData.map((row) => {
          const asset = assetById.get(row.assetId);
          const count = asset ? formatUnitCount(asset, row.quantity) : null;
          const custodyPhrase = count ? `custody of ${count}` : "custody";
          return createNotes({
            content: `${actor} granted ${custodianDisplay} ${custodyPhrase} via ${kitLink}.`,
            type: NoteType.UPDATE,
            userId,
            assetIds: [row.assetId],
            organizationId,
          });
        })
      );
    }

    notifyCustodians({
      organizationId,
      actorUserId: userId,
      kind: "assigned",
      changes: [
        {
          teamMemberId: custodianId,
          kitId: kit.id,
          title: kit.name,
          contents: kit.assetKits.map((ak) => ak.asset.title),
        },
      ],
    });

    sendNotification({
      title: `‘${kit.name}’ is now in custody of ${custodianName}`,
      message:
        "Remember, this kit will be unavailable until it is manually checked in.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect(`/kits/${kitId}/assets`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, kitId });
    return data(error(reason), { status: reason.status });
  }
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

export default function GiveKitCustody() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);
  const actionData = useActionData<typeof action>();
  const { kit, teamMembers } = useLoaderData<typeof loader>();

  const assignsSelfOnly = useRoleAccess().custody.assign === "self";

  const hasBookings = kit.assetKits.some(
    (ak) => ak.asset.bookingAssets.length > 0
  );
  const zo = useZorm("BulkAssignCustody", AssignCustodySchema);
  const error = zo.errors.custodian()?.message || actionData?.error?.message;

  return (
    <Form method="post" ref={zo.ref}>
      <div className="modal-content-wrapper">
        <div className="mb-4 inline-flex items-center justify-center rounded-full border-8 border-solid border-primary-50 bg-primary-100 p-2 text-primary-600">
          <UserIcon />
        </div>

        <div className="mb-5">
          <h4>
            {assignsSelfOnly
              ? t("kits.kitsKitidAssetsAssignCustody.take")
              : t("kits.kitsKitidAssetsAssignCustody.assign")}{" "}
            {t("kits.kitsKitidAssetsAssignCustody.custodyOfKit")}
          </h4>
          <p>
            {assignsSelfOnly
              ? t("kits.kitsKitidAssetsAssignCustody.aboutToAssignSelf")
              : t("kits.kitsKitidAssetsAssignCustody.aboutToAssignMember")}
          </p>
        </div>

        <div className="relative z-50 mb-8">
          <DynamicSelect
            hidden={assignsSelfOnly}
            showSearch={!assignsSelfOnly}
            disabled={disabled || assignsSelfOnly}
            defaultValue={
              assignsSelfOnly && teamMembers?.length > 0
                ? JSON.stringify({
                    id: teamMembers[0].id,
                    name: resolveTeamMemberName(teamMembers[0]),
                  })
                : undefined
            }
            model={{
              name: "teamMember",
              queryKey: "name",
              deletedAt: null,
              // Custody assignment: the picker follows the caller's custody
              // scope (only themselves, or nobody). Stated explicitly so the
              // behaviour survives a change to the endpoint's fallback.
              custodyPurpose: "custody-assignment",
            }}
            fieldName="custodian"
            contentLabel={t("kits.kitsKitidAssetsAssignCustody.teamMembers")}
            initialDataKey="teamMembers"
            countKey="totalTeamMembers"
            placeholder={t(
              "kits.kitsKitidAssetsAssignCustody.selectATeamMember"
            )}
            closeOnSelect
            transformItem={toCustodyAssignmentItem}
            extraContent={({ onItemCreated, closePopover }) => (
              <InlineTeamMemberCreation
                onItemCreated={onItemCreated}
                closePopover={closePopover}
                transformItem={toCustodyAssignmentItem}
              />
            )}
            renderItem={(item) => resolveTeamMemberName(item, true)}
          />
        </div>
        {error ? (
          <div className="-mt-8 mb-8 text-sm text-error-500">{error}</div>
        ) : null}

        {hasBookings ? (
          <WarningBox className="-mt-4 mb-8">
            <>
              <Trans
                t={t}
                i18nKey="kits.kitsKitidAssetsAssignCustody.kitIsPartOfAn"
                components={[
                  <Link
                    key="slot0"
                    to={`/bookings/${kit.assetKits[0]?.asset.bookingAssets[0]?.booking.id}`}
                    className="underline"
                    target="_blank"
                  />,
                ]}
              />
            </>
          </WarningBox>
        ) : null}

        <div className="flex gap-3">
          <Button to=".." variant="secondary" width="full" disabled={disabled}>
            {t("kits.kitsKitidAssetsAssignCustody.cancel")}
          </Button>
          <Button
            variant="primary"
            width="full"
            type="submit"
            disabled={disabled}
          >
            {t("kits.kitsKitidAssetsAssignCustody.confirm")}
          </Button>
        </div>
      </div>
    </Form>
  );
}

import type { Organization } from "@prisma/client";
import { canUseAudits } from "../addon-entitlements.server";
import { ShelfError } from "../error";

/**
 * Server-side utility to check if audits are enabled for an organization.
 * Defers to `canUseAudits`, so every workspace qualifies when premium
 * features are off.
 */
export function organizationHasAuditsEnabled(
  organization: Pick<Organization, "auditsEnabled"> | undefined | null
): boolean {
  if (!organization) return false;
  return canUseAudits(organization);
}

/**
 * Server-side utility to validate that an organization has audits enabled
 * Throws ShelfError if not enabled
 */
export function validateAuditEnabled(
  organization: Pick<Organization, "auditsEnabled"> | undefined | null,
  additionalData?: Record<string, any>
): void {
  if (!organizationHasAuditsEnabled(organization)) {
    throw new ShelfError({
      cause: null,
      title: "Audits not enabled",
      message: "Audit functionality is not enabled for this workspace",
      status: 403,
      additionalData,
      label: "Audit",
      shouldBeCaptured: false,
    });
  }
}

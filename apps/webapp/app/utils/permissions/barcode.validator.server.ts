import type { Organization } from "@prisma/client";
import { canUseBarcodes } from "../addon-entitlements.server";
import { ShelfError } from "../error";

/**
 * Server-side utility to check if barcodes are enabled for an organization.
 * Defers to `canUseBarcodes`, so every workspace qualifies when premium
 * features are off.
 */
export function organizationHasBarcodesEnabled(
  organization: Pick<Organization, "barcodesEnabled"> | undefined | null
): boolean {
  if (!organization) return false;
  return canUseBarcodes(organization);
}

/**
 * Server-side utility to validate that an organization has barcodes enabled
 * Throws ShelfError if not enabled
 */
export function validateBarcodeEnabled(
  organization: Pick<Organization, "barcodesEnabled"> | undefined | null,
  additionalData?: Record<string, any>
): void {
  if (!organizationHasBarcodesEnabled(organization)) {
    throw new ShelfError({
      cause: null,
      title: "Barcodes not enabled",
      message: "Barcode functionality is not enabled for this workspace",
      status: 403,
      additionalData,
      label: "Barcode",
      shouldBeCaptured: false,
    });
  }
}

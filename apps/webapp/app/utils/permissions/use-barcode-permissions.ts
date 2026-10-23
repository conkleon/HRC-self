import { useCurrentOrganization } from "~/hooks/use-current-organization";

/**
 * Hook to check if barcodes are enabled for the current organization.
 *
 * `currentOrganization.barcodesEnabled` is already the effective entitlement
 * (`canUseBarcodes` in `~/utils/subscription.server`, applied by
 * `getSelectedOrganization`), so it is true for every workspace when premium
 * features are off.
 */
export function useBarcodePermissions() {
  const currentOrganization = useCurrentOrganization();

  return {
    /**
     * Whether barcodes are enabled for the current organization
     */
    barcodesEnabled: currentOrganization?.barcodesEnabled ?? false,

    /** Whether the user can use barcode features (same as `barcodesEnabled`) */
    canUseBarcodes: currentOrganization?.barcodesEnabled ?? false,
  };
}

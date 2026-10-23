/**
 * Add-on Entitlements
 *
 * Answers "may this workspace use the audits / barcodes add-on?". A workspace
 * holds an add-on when it bought it, and every workspace holds every add-on
 * when premium features are off (`ENABLE_PREMIUM_FEATURES=false`, the
 * self-hosted default), because there is no billing to gate them behind.
 *
 * This module depends on config only. `getSelectedOrganization` applies these
 * checks to every workspace it resolves, so importing anything that leads back
 * to the organization context here would create an import cycle.
 *
 * @see {@link file://./subscription.server.ts} re-exports these helpers
 * @see {@link file://../modules/organization/context.server.ts}
 */
import { config } from "~/config/shelf.config";

const premiumIsEnabled = config.enablePremiumFeatures;

/**
 * Whether a workspace may use the audits add-on.
 *
 * @param org - The workspace's stored add-on flag
 * @returns True when premium features are off or the add-on is active
 */
export const canUseAudits = (org: { auditsEnabled: boolean }) => {
  if (!premiumIsEnabled) return true;
  return org.auditsEnabled;
};

/**
 * Whether a workspace may use the barcodes add-on.
 *
 * @param org - The workspace's stored add-on flag
 * @returns True when premium features are off or the add-on is active
 */
export const canUseBarcodes = (org: { barcodesEnabled: boolean }) => {
  if (!premiumIsEnabled) return true;
  return org.barcodesEnabled;
};

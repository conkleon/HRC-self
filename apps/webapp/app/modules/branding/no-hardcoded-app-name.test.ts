/**
 * Guards the `APP_NAME` rebrand on the emails volunteers receive: their
 * subjects and sign-offs must name the product through `getAppName()`.
 * Billing (Stripe) emails, the onboarding founder email and the internal
 * account-deletion notice to the Shelf admin keep the Shelf name on purpose,
 * so they are not scanned.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(__dirname, "../..");

/** Files that build user-facing, non-billing emails. */
const EMAIL_SOURCES = [
  "modules/booking/service.server.ts",
  "modules/organization/service.server.ts",
  "modules/report-found/service.server.ts",
  "modules/user/service.server.ts",
  "routes/_layout+/account-details.general.tsx",
  "emails/feedback/feedback-copy-email.tsx",
  "routes/_layout+/settings.emails.tsx",
];

/** Hardcoded product names in a subject, sign-off or "sent via" line. */
const HARDCODED = [
  /subject:\s*`[^`]*(?:shelf\.nu|\bShelf\b)/,
  /\bShelf Team\b/i,
  /\bthe Shelf team\b/i,
  /sent via shelf\.nu/,
  /Your shelf account/,
  /\) - shelf\.nu/,
  /© 2026 Shelf\.nu|&copy; 2026 Shelf\.nu/,
];

describe("user-facing emails name the configured app", () => {
  for (const file of EMAIL_SOURCES) {
    it(`${file} has no hardcoded Shelf name`, () => {
      const lines = fs
        .readFileSync(path.join(APP, file), "utf8")
        .split("\n")
        // The deletion request goes to the instance admin, not a volunteer.
        .filter((line) => !line.includes("updates@emails.shelf.nu"));
      const offending = lines.filter((line) =>
        HARDCODED.some((pattern) => pattern.test(line))
      );
      expect(offending).toEqual([]);
    });
  }
});

-- Self-service custody: workspace switch and PIN for anonymous QR take/return.
ALTER TABLE "Organization"
  ADD COLUMN "selfCustodyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfCustodyPinHash" TEXT,
  ADD COLUMN "selfCustodyPinUpdatedAt" TIMESTAMP(3);

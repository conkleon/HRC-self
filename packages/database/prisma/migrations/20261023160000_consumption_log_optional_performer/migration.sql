-- A self-service take or return of quantity-tracked units has no acting user.
ALTER TABLE "ConsumptionLog" ALTER COLUMN "userId" DROP NOT NULL;

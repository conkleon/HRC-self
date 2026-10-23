-- CreateTable
CREATE TABLE "_SelfCustodyLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SelfCustodyLocations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_SelfCustodyLocations_B_index" ON "_SelfCustodyLocations"("B");

-- AddForeignKey
ALTER TABLE "_SelfCustodyLocations" ADD CONSTRAINT "_SelfCustodyLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SelfCustodyLocations" ADD CONSTRAINT "_SelfCustodyLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "_SelfCustodyLocations" ENABLE row level security;

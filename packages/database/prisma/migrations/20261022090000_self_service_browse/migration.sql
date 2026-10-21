-- Self-service browse page: the tag that marks items volunteers may take
-- without scanning, and the secret token in the page's link.
ALTER TABLE "Organization"
  ADD COLUMN "selfCustodyTagId" TEXT,
  ADD COLUMN "selfCustodyBrowseToken" TEXT;

CREATE UNIQUE INDEX "Organization_selfCustodyBrowseToken_key" ON "Organization"("selfCustodyBrowseToken");

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_selfCustodyTagId_fkey" FOREIGN KEY ("selfCustodyTagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

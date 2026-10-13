DELETE FROM "AuthSession";
ALTER TABLE "AuthSession" DROP CONSTRAINT "AuthSession_role_check";
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_role_check" CHECK ("role" IN ('user','admin','super_admin','server_admin'));
CREATE TABLE "PersonAccount" (
 "accountId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "personId" TEXT NOT NULL, "createdAt" TEXT NOT NULL
);
CREATE INDEX "PersonAccount_person_idx" ON "PersonAccount"("personId");
CREATE TABLE "AccountLinkProof" (
 "hash" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "sessionId" TEXT NOT NULL REFERENCES "AuthSession"("id") ON DELETE CASCADE,
 "expiresAt" TEXT NOT NULL
);

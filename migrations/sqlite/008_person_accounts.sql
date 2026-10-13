-- Changing the privilege model requires every existing session to authenticate again.
DROP TABLE "AuthSession";
CREATE TABLE "AuthSession" (
 "id" TEXT PRIMARY KEY, "username" TEXT NOT NULL,
 "role" TEXT NOT NULL CHECK ("role" IN ('user','admin','super_admin','server_admin')),
 "expiresAt" TEXT NOT NULL, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "identity" TEXT
);
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
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

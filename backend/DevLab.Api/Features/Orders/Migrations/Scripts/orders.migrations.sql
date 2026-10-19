CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
    "ProductVersion" TEXT NOT NULL
);

BEGIN TRANSACTION;
CREATE TABLE "Orders" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_Orders" PRIMARY KEY AUTOINCREMENT,
    "CustomerName" TEXT NOT NULL,
    "ProductId" INTEGER NOT NULL,
    "ProductName" TEXT NOT NULL,
    "UnitPrice" TEXT NOT NULL,
    "Quantity" INTEGER NOT NULL,
    "Status" TEXT NOT NULL,
    "PlacedAt" TEXT NOT NULL
);

CREATE INDEX "IX_Orders_CustomerName" ON "Orders" ("CustomerName");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261019092532_InitialCreate', '10.0.12');

COMMIT;

BEGIN TRANSACTION;
CREATE TABLE "IdempotencyRecords" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_IdempotencyRecords" PRIMARY KEY AUTOINCREMENT,
    "Scope" TEXT NOT NULL,
    "Key" TEXT NOT NULL,
    "RequestHash" TEXT NOT NULL,
    "StatusCode" INTEGER NULL,
    "ResponseBody" TEXT NULL,
    "CreatedAt" TEXT NOT NULL
);

CREATE TABLE "OutboxMessages" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_OutboxMessages" PRIMARY KEY,
    "Type" TEXT NOT NULL,
    "Payload" TEXT NOT NULL,
    "OccurredAt" TEXT NOT NULL,
    "ProcessedAt" TEXT NULL,
    "Attempts" INTEGER NOT NULL,
    "Error" TEXT NULL
);

CREATE UNIQUE INDEX "IX_IdempotencyRecords_Scope_Key" ON "IdempotencyRecords" ("Scope", "Key");

CREATE INDEX "IX_OutboxMessages_ProcessedAt_OccurredAt" ON "OutboxMessages" ("ProcessedAt", "OccurredAt");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261019092939_AddIdempotencyAndOutbox', '10.0.12');

COMMIT;


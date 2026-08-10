import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260717090000_stage0_planning_revision/migration.sql",
  ),
  "utf8",
);
const fingerprintMigration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260723120000_stage0_planning_mutation_fingerprint/migration.sql",
  ),
  "utf8",
);

describe("Stage 0 planning persistence", () => {
  it("starts existing and new trips at planning revision zero", () => {
    expect(schema).toMatch(
      /planningRevision\s+Int\s+@default\(0\)\s+@map\("planning_revision"\)/,
    );
    expect(migration).toMatch(
      /ADD COLUMN "planning_revision" INTEGER NOT NULL DEFAULT 0;/,
    );
  });

  it("scopes operation-id uniqueness to each trip", () => {
    expect(schema).toContain("@@unique([tripId, operationId])");
    expect(migration).toContain(
      'ON "planning_mutations"("trip_id", "operation_id");',
    );
    expect(schema).not.toMatch(/operationId\s+String\s+@unique/);
  });

  it("indexes trip mutation history and cascades it with the trip", () => {
    expect(schema).toContain("@@index([tripId, createdAt])");
    expect(migration).toContain(
      'ON "planning_mutations"("trip_id", "created_at");',
    );
    expect(migration).toContain("ON DELETE CASCADE ON UPDATE CASCADE;");
  });

  it("stores a nullable SHA-256 request fingerprint additively", () => {
    expect(schema).toMatch(
      /requestFingerprint\s+String\?\s+@map\("request_fingerprint"\)\s+@db\.Char\(64\)/,
    );
    expect(fingerprintMigration).toContain(
      'ADD COLUMN "request_fingerprint" CHAR(64);',
    );
    expect(fingerprintMigration).not.toContain("NOT NULL");
  });
});

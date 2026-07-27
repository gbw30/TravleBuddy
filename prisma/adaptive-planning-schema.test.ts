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
    "prisma/migrations/20260727090000_adaptive_planning_foundation/migration.sql",
  ),
  "utf8",
);

describe("adaptive-planning migration safety", () => {
  it("is additive and never deletes existing product data", () => {
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });

  it("backfills preference and itinerary versions before activating pointers", () => {
    const preferenceInsert = migration.indexOf(
      'INSERT INTO "preference_profile_versions"',
    );
    const preferenceActivation = migration.indexOf(
      'SET "active_preference_profile_version_id"',
    );
    const itineraryInsert = migration.indexOf(
      'INSERT INTO "itinerary_versions"',
    );
    const itineraryActivation = migration.indexOf(
      'SET "active_itinerary_version_id"',
    );
    const dayAssociation = migration.indexOf(
      'SET "itinerary_version_id" = t."active_itinerary_version_id"',
    );
    const dayNotNull = migration.indexOf(
      'ALTER COLUMN "itinerary_version_id" SET NOT NULL',
    );
    const conflictAssociation = migration.indexOf('UPDATE "conflicts" c');
    const conflictNotNull = migration.lastIndexOf(
      'ALTER COLUMN "itinerary_version_id" SET NOT NULL',
    );

    expect(preferenceInsert).toBeGreaterThan(-1);
    expect(preferenceActivation).toBeGreaterThan(preferenceInsert);
    expect(itineraryInsert).toBeGreaterThan(preferenceActivation);
    expect(itineraryActivation).toBeGreaterThan(itineraryInsert);
    expect(dayAssociation).toBeGreaterThan(itineraryActivation);
    expect(dayNotNull).toBeGreaterThan(dayAssociation);
    expect(migration).toContain(
      'SELECT 1 FROM "conflicts" c WHERE c."trip_id" = t."id"',
    );
    expect(conflictAssociation).toBeGreaterThan(dayAssociation);
    expect(conflictNotNull).toBeGreaterThan(conflictAssociation);
    expect(conflictNotNull).toBeGreaterThan(dayNotNull);
  });

  it("replaces mutable-day uniqueness with version-scoped uniqueness", () => {
    expect(migration).toContain(
      'DROP INDEX "itinerary_days_trip_id_day_number_key";',
    );
    expect(migration).toContain(
      'ON "itinerary_days"("itinerary_version_id", "day_number");',
    );
    expect(schema).toContain("@@unique([itineraryVersionId, dayNumber])");
    expect(schema).not.toContain("@@unique([tripId, dayNumber])");
  });

  it("adds replay, source, and queue-claim indexes", () => {
    expect(migration).toContain(
      'ON "generation_jobs"("trip_id", "idempotency_key");',
    );
    expect(migration).toContain(
      'ON "generation_jobs"("status", "available_at");',
    );
    expect(migration).toContain(
      'ON "generation_jobs"("status", "lease_expires_at");',
    );
    expect(migration).toContain(
      'ON "preference_profile_versions"("trip_id", "source_feedback_id");',
    );
    expect(migration).toContain(
      'ON "itinerary_versions"("trip_id", "source_job_id");',
    );
  });

  it("enforces same-trip ownership for every version-bearing relationship", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("id", "active_preference_profile_version_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("id", "active_itinerary_version_id")',
    );
    expect(migration).toContain('FOREIGN KEY ("trip_id", "parent_version_id")');
    expect(migration).toContain(
      'FOREIGN KEY ("trip_id", "preference_profile_version_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("trip_id", "parent_itinerary_version_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("trip_id", "itinerary_version_id")',
    );
    expect(schema).toContain(
      "fields: [id, activePreferenceProfileVersionId], references: [tripId, id]",
    );
    expect(schema).toContain(
      "fields: [tripId, itineraryVersionId], references: [tripId, id]",
    );
  });
});

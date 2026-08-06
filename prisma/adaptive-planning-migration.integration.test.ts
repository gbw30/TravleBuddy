import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.ADAPTATION_TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const migrationName = "20260727090000_adaptive_planning_foundation";
const migrationRoot = resolve(process.cwd(), "prisma/migrations");
const schemaName = `adaptive_migration_${randomUUID().replaceAll("-", "")}`;

function quotedIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error("Unsafe PostgreSQL test-schema identifier.");
  }

  return `"${value}"`;
}

describeWithPostgres("adaptive-planning existing-trip migration", () => {
  let client: Client;
  let schemaCreated = false;

  beforeAll(async () => {
    if (!databaseUrl) return;

    client = new Client({
      connectionString: databaseUrl,
      application_name: "travlebuddy-adaptive-migration-test",
    });
    await client.connect();
    await client.query(`CREATE SCHEMA ${quotedIdentifier(schemaName)}`);
    schemaCreated = true;
    await client.query(`SET search_path TO ${quotedIdentifier(schemaName)}`);

    const precedingMigrations = readdirSync(migrationRoot, {
      withFileTypes: true,
    })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name < migrationName &&
          /^\d+_[a-z0-9_]+$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();

    for (const name of precedingMigrations) {
      const sql = readFileSync(
        resolve(migrationRoot, name, "migration.sql"),
        "utf8",
      );
      await client.query(sql);
    }

    await client.query(`
      INSERT INTO "users" ("id", "email", "updated_at")
      VALUES ('user_legacy', 'legacy@example.test', CURRENT_TIMESTAMP);

      INSERT INTO "trips" (
        "id",
        "user_id",
        "title",
        "status",
        "start_date",
        "end_date",
        "budget_amount",
        "budget_currency",
        "updated_at"
      )
      VALUES (
        'trip_legacy',
        'user_legacy',
        'Legacy trip',
        'PLANNING',
        '2026-08-01T00:00:00.000Z',
        '2026-08-02T00:00:00.000Z',
        500,
        'USD',
        '2026-07-01T12:00:00.000Z'
      ), (
        'trip_conflict_only',
        'user_legacy',
        'Conflict-only trip',
        'PLANNING',
        '2026-09-01T00:00:00.000Z',
        '2026-09-02T00:00:00.000Z',
        300,
        'USD',
        '2026-07-01T12:00:00.000Z'
      );

      INSERT INTO "trip_preferences" (
        "id",
        "trip_id",
        "pace",
        "interests",
        "updated_at"
      )
      VALUES (
        'preference_legacy',
        'trip_legacy',
        'BALANCED',
        ARRAY['MUSEUM']::TEXT[],
        '2026-07-02T12:00:00.000Z'
      );

      INSERT INTO "itinerary_days" (
        "id",
        "trip_id",
        "day_number",
        "date",
        "title",
        "estimated_cost_amount",
        "estimated_cost_currency",
        "updated_at"
      )
      VALUES (
        'day_legacy',
        'trip_legacy',
        1,
        '2026-08-01T00:00:00.000Z',
        'Legacy day',
        40,
        'USD',
        '2026-07-03T12:00:00.000Z'
      );

      INSERT INTO "itinerary_items" (
        "id",
        "trip_id",
        "day_id",
        "title",
        "sort_order",
        "updated_at"
      )
      VALUES (
        'item_legacy',
        'trip_legacy',
        'day_legacy',
        'Legacy museum',
        0,
        '2026-07-03T12:00:00.000Z'
      );

      INSERT INTO "conflicts" (
        "id",
        "trip_id",
        "itinerary_item_id",
        "type",
        "severity",
        "status",
        "message",
        "updated_at"
      )
      VALUES (
        'conflict_legacy',
        'trip_legacy',
        'item_legacy',
        'TIME',
        'HIGH',
        'OPEN',
        'Legacy overlap',
        '2026-07-03T12:00:00.000Z'
      ), (
        'conflict_trip_only',
        'trip_conflict_only',
        NULL,
        'HOTEL_LOCATION',
        'MEDIUM',
        'OPEN',
        'Legacy trip-level warning',
        '2026-07-03T12:00:00.000Z'
      );

      INSERT INTO "planning_feedback" (
        "id",
        "trip_id",
        "target_type",
        "target_id",
        "source",
        "action",
        "reason",
        "metadata",
        "itinerary_day_id",
        "itinerary_item_id",
        "created_at"
      )
      VALUES (
        'feedback_legacy',
        'trip_legacy',
        'ITINERARY_ITEM',
        'item_legacy',
        'USER',
        'REJECT',
        'OTHER',
        '{"legacy":true}'::jsonb,
        'day_legacy',
        'item_legacy',
        '2026-07-04T12:00:00.000Z'
      );
    `);

    await client.query(
      readFileSync(
        resolve(migrationRoot, migrationName, "migration.sql"),
        "utf8",
      ),
    );
  }, 120_000);

  afterAll(async () => {
    if (!client) return;

    try {
      await client.query("SET search_path TO public");
      if (schemaCreated) {
        await client.query(
          `DROP SCHEMA ${quotedIdentifier(schemaName)} CASCADE`,
        );
      }
    } finally {
      await client.end();
    }
  });

  it("backfills active versions without deleting or retargeting legacy state", async () => {
    const trip = (
      await client.query<{
        tripVersion: number;
        preferenceVersionId: string | null;
        itineraryVersionId: string | null;
      }>(`
        SELECT
          "trip_version" AS "tripVersion",
          "active_preference_profile_version_id" AS "preferenceVersionId",
          "active_itinerary_version_id" AS "itineraryVersionId"
        FROM "trips"
        WHERE "id" = 'trip_legacy'
      `)
    ).rows[0];
    expect(trip).toEqual({
      tripVersion: 1,
      preferenceVersionId: "prefv_migrated_trip_legacy",
      itineraryVersionId: "itv_migrated_trip_legacy",
    });

    const conflictOnlyTrip = (
      await client.query<{
        itineraryVersionId: string | null;
        conflictVersionId: string | null;
      }>(`
        SELECT
          t."active_itinerary_version_id" AS "itineraryVersionId",
          c."itinerary_version_id" AS "conflictVersionId"
        FROM "trips" t
        JOIN "conflicts" c ON c."trip_id" = t."id"
        WHERE t."id" = 'trip_conflict_only'
          AND c."id" = 'conflict_trip_only'
      `)
    ).rows[0];
    expect(conflictOnlyTrip).toEqual({
      itineraryVersionId: "itv_migrated_trip_conflict_only",
      conflictVersionId: "itv_migrated_trip_conflict_only",
    });

    const preference = (
      await client.query<{
        version: number;
        snapshot: {
          interests: Record<
            string,
            { weight: number; confidence: number; source: string }
          >;
          pace: { value: string; source: string } | null;
        };
      }>(`
        SELECT "version", "snapshot"
        FROM "preference_profile_versions"
        WHERE "trip_id" = 'trip_legacy'
      `)
    ).rows[0];
    expect(preference.version).toBe(1);
    expect(preference.snapshot.interests.MUSEUM).toMatchObject({
      weight: 1,
      confidence: 1,
      source: "EXPLICIT",
    });
    expect(preference.snapshot.pace).toMatchObject({
      value: "BALANCED",
      source: "EXPLICIT",
    });

    await expect(
      client.query(`
        SELECT 1
        FROM "itinerary_days"
        WHERE "id" = 'day_legacy'
          AND "itinerary_version_id" = 'itv_migrated_trip_legacy'
      `),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      client.query(`
        SELECT 1
        FROM "conflicts"
        WHERE "id" = 'conflict_legacy'
          AND "itinerary_version_id" = 'itv_migrated_trip_legacy'
      `),
    ).resolves.toMatchObject({ rowCount: 1 });

    const feedback = (
      await client.query<{
        action: string | null;
        reason: string | null;
        metadata: { legacy: boolean } | null;
        eventKey: string | null;
        capturedTripVersion: number | null;
        processingStatus: string;
      }>(`
        SELECT
          "action"::text AS "action",
          "reason"::text AS "reason",
          "metadata",
          "event_key" AS "eventKey",
          "captured_trip_version" AS "capturedTripVersion",
          "processing_status"::text AS "processingStatus"
        FROM "planning_feedback"
        WHERE "id" = 'feedback_legacy'
      `)
    ).rows[0];
    expect(feedback).toEqual({
      action: "REJECT",
      reason: "OTHER",
      metadata: { legacy: true },
      eventKey: null,
      capturedTripVersion: null,
      processingStatus: "RECORDED",
    });

    await client.query(`
      INSERT INTO "itinerary_versions" (
        "id",
        "trip_id",
        "version",
        "status",
        "change_scope"
      )
      VALUES (
        'itv_second_trip_legacy',
        'trip_legacy',
        2,
        'DRAFT',
        'ITEM'
      );

      INSERT INTO "itinerary_days" (
        "id",
        "trip_id",
        "itinerary_version_id",
        "day_number",
        "updated_at"
      )
      VALUES (
        'day_second_version',
        'trip_legacy',
        'itv_second_trip_legacy',
        1,
        CURRENT_TIMESTAMP
      );
    `);

    await expect(
      client.query(`
        INSERT INTO "itinerary_days" (
          "id",
          "trip_id",
          "itinerary_version_id",
          "day_number",
          "updated_at"
        )
        VALUES (
          'day_duplicate_version',
          'trip_legacy',
          'itv_second_trip_legacy',
          1,
          CURRENT_TIMESTAMP
        )
      `),
    ).rejects.toMatchObject({ code: "23505" });

    await client.query(`
      INSERT INTO "trips" (
        "id",
        "user_id",
        "title",
        "status",
        "updated_at"
      )
      VALUES (
        'trip_other',
        'user_legacy',
        'Other trip',
        'DRAFT',
        CURRENT_TIMESTAMP
      )
    `);
    await expect(
      client.query(`
        UPDATE "trips"
        SET "active_itinerary_version_id" = 'itv_migrated_trip_legacy'
        WHERE "id" = 'trip_other'
      `),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

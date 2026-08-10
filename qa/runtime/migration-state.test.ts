import { describe, expect, test } from "vitest";
import {
  assertMigrationPreflightState,
  assertMigrationWorkflowBranch,
  type MigrationDatabaseState,
} from "./migration-state";

function migrationState(
  overrides: Partial<MigrationDatabaseState> = {},
): MigrationDatabaseState {
  return {
    hasLedger: false,
    appTableCount: 0,
    appliedMigrationCount: 0,
    failedMigrationCount: 0,
    expectedHeadApplied: false,
    latestAppliedMigration: null,
    databaseRole: "travlebuddy_qa_migrator",
    schemaOwner: "pg_database_owner",
    hasSchemaUsage: true,
    hasSchemaCreate: true,
    ...overrides,
  };
}

describe("protected migration state", () => {
  test("accepts an empty database with a migration-capable role", () => {
    expect(() => assertMigrationPreflightState(migrationState())).not.toThrow();
  });

  test("accepts an existing database with applied migration history", () => {
    expect(() =>
      assertMigrationPreflightState(
        migrationState({
          hasLedger: true,
          appTableCount: 16,
          appliedMigrationCount: 7,
          expectedHeadApplied: true,
          latestAppliedMigration:
            "20260723120000_stage0_planning_mutation_fingerprint",
        }),
      ),
    ).not.toThrow();
  });

  test("rejects application tables without applied migration history", () => {
    expect(() =>
      assertMigrationPreflightState(
        migrationState({
          hasLedger: true,
          appTableCount: 16,
          appliedMigrationCount: 0,
        }),
      ),
    ).toThrow("no applied Prisma migration history");
  });

  test("rejects an unfinished migration", () => {
    expect(() =>
      assertMigrationPreflightState(
        migrationState({
          hasLedger: true,
          failedMigrationCount: 1,
        }),
      ),
    ).toThrow("contains an unfinished migration");
  });

  test.each([
    { hasSchemaUsage: false, hasSchemaCreate: true },
    { hasSchemaUsage: true, hasSchemaCreate: false },
  ])(
    "rejects a migration role without required schema privileges",
    (privileges) => {
      expect(() =>
        assertMigrationPreflightState(
          migrationState({
            ...privileges,
          }),
        ),
      ).toThrow("requires USAGE and CREATE");
    },
  );

  test("requires the workflow definition and requested branch to match", () => {
    expect(() => assertMigrationWorkflowBranch("qa", "qa")).not.toThrow();
    expect(() => assertMigrationWorkflowBranch("main", "qa")).toThrow(
      "Run this workflow from the qa branch",
    );
  });
});

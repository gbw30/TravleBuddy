export type MigrationDatabaseState = {
  hasLedger: boolean;
  appTableCount: number;
  appliedMigrationCount: number;
  failedMigrationCount: number;
  expectedHeadApplied: boolean;
  latestAppliedMigration: string | null;
  databaseRole: string;
  schemaOwner: string;
  hasSchemaUsage: boolean;
  hasSchemaCreate: boolean;
};

export function assertMigrationWorkflowBranch(
  workflowBranch: string,
  requestedBranch: string,
) {
  if (workflowBranch !== requestedBranch) {
    throw new Error(
      `Run this workflow from the ${requestedBranch} branch; the selected workflow branch is ${workflowBranch}.`,
    );
  }
}

export function assertMigrationPreflightState(state: MigrationDatabaseState) {
  if (state.failedMigrationCount > 0) {
    throw new Error(
      "Refusing deploy: the Prisma migration ledger contains an unfinished migration.",
    );
  }

  if (state.appTableCount > 0 && state.appliedMigrationCount === 0) {
    throw new Error(
      "Refusing deploy: the database has application tables but no applied Prisma migration history.",
    );
  }

  if (!state.hasSchemaUsage || !state.hasSchemaCreate) {
    throw new Error(
      `Refusing deploy: migration role ${state.databaseRole} requires USAGE and CREATE on schema public.`,
    );
  }
}

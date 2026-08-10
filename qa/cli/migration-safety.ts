import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import {
  assertQaWritesAllowed,
  readQaEnvironment,
} from "../runtime/environment";
import {
  parseMigrationPhase,
  sanitizeMigrationError,
  writeMigrationFailureReceipt,
} from "../runtime/migration-evidence";
import {
  assertMigrationPreflightState,
  assertMigrationWorkflowBranch,
  type MigrationDatabaseState,
} from "../runtime/migration-state";

const fullSha = /^[a-f0-9]{40}$/;
const migrationName = /^\d{14}_[a-z0-9_]+$/;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function git(...args: string[]) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to verify Git identity with: git ${args.join(" ")}`,
    );
  }
  return result.stdout.trim();
}

async function migrationDirectories() {
  return (
    await readdir(path.resolve("prisma", "migrations"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory() && migrationName.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function inspectDatabase(client: Client, expectedHead: string) {
  const privilegeResult = await client.query<{
    database_role: string;
    schema_owner: string;
    has_schema_usage: boolean;
    has_schema_create: boolean;
  }>(
    `SELECT current_user AS database_role,
            pg_get_userbyid(nspowner) AS schema_owner,
            has_schema_privilege(current_user, 'public', 'USAGE') AS has_schema_usage,
            has_schema_privilege(current_user, 'public', 'CREATE') AS has_schema_create
       FROM pg_namespace
      WHERE nspname = 'public'`,
  );
  const privileges = privilegeResult.rows[0];
  if (!privileges) {
    throw new Error("QA database does not contain the public schema.");
  }

  const ledgerResult = await client.query<{
    ledger: string | null;
  }>("SELECT to_regclass('public._prisma_migrations')::text AS ledger");
  const hasLedger = ledgerResult.rows[0]?.ledger !== null;
  const tablesResult = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'`,
  );
  const appTableCount = Number(tablesResult.rows[0]?.count ?? "0");

  if (!hasLedger) {
    return {
      hasLedger,
      appTableCount,
      appliedMigrationCount: 0,
      failedMigrationCount: 0,
      expectedHeadApplied: false,
      latestAppliedMigration: null,
      databaseRole: privileges.database_role,
      schemaOwner: privileges.schema_owner,
      hasSchemaUsage: privileges.has_schema_usage,
      hasSchemaCreate: privileges.has_schema_create,
    };
  }

  const migrationsResult = await client.query<{
    migration_name: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
  }>(
    `SELECT migration_name, finished_at, rolled_back_at
       FROM public._prisma_migrations
      ORDER BY started_at ASC`,
  );
  const applied = migrationsResult.rows.filter(
    (migration) =>
      migration.finished_at !== null && migration.rolled_back_at === null,
  );
  const failed = migrationsResult.rows.filter(
    (migration) =>
      migration.finished_at === null && migration.rolled_back_at === null,
  );

  return {
    hasLedger,
    appTableCount,
    appliedMigrationCount: applied.length,
    failedMigrationCount: failed.length,
    expectedHeadApplied: applied.some(
      (migration) => migration.migration_name === expectedHead,
    ),
    latestAppliedMigration: applied.at(-1)?.migration_name ?? null,
    databaseRole: privileges.database_role,
    schemaOwner: privileges.schema_owner,
    hasSchemaUsage: privileges.has_schema_usage,
    hasSchemaCreate: privileges.has_schema_create,
  };
}

async function main() {
  const phase = parseMigrationPhase(process.argv[2]);
  if (!phase) {
    throw new Error(
      "Usage: tsx qa/cli/migration-safety.ts <preflight|postflight>",
    );
  }

  const environment = readQaEnvironment();
  const safety = assertQaWritesAllowed(environment);
  if (environment.target !== "preview") {
    throw new Error("Protected QA migrations require QA_TARGET=preview.");
  }

  const expectedOrigin = required("QA_MIGRATION_EXPECTED_ORIGIN");
  if (environment.baseUrl.origin !== expectedOrigin) {
    throw new Error("QA_BASE_URL does not match the protected QA origin.");
  }

  const commitSha = required("QA_MIGRATION_COMMIT_SHA").toLocaleLowerCase();
  const branch = required("QA_MIGRATION_BRANCH");
  const workflowBranch = required("QA_MIGRATION_WORKFLOW_BRANCH");
  const expectedHead = required("QA_MIGRATION_HEAD");
  const confirmation = required("QA_MIGRATION_CONFIRMATION");
  const protectedFingerprint = required(
    "QA_MIGRATION_EXPECTED_DATABASE_FINGERPRINT",
  );
  if (safety.databaseFingerprint !== protectedFingerprint) {
    throw new Error(
      "Database fingerprint does not match the protected QA database identity.",
    );
  }
  if (!fullSha.test(commitSha)) {
    throw new Error(
      "QA_MIGRATION_COMMIT_SHA must be a full lowercase Git SHA.",
    );
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) {
    throw new Error("QA_MIGRATION_BRANCH is invalid.");
  }
  assertMigrationWorkflowBranch(workflowBranch, branch);
  if (!migrationName.test(expectedHead)) {
    throw new Error("QA_MIGRATION_HEAD is not a migration directory name.");
  }
  if (
    confirmation !==
    `MIGRATE QA ${safety.databaseFingerprint} TO ${expectedHead}`
  ) {
    throw new Error("Typed migration confirmation does not match exactly.");
  }

  const headSha = git("rev-parse", "HEAD").toLocaleLowerCase();
  const remoteBranch = git(
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ).split(/\s+/);
  const branchSha = remoteBranch[0]?.toLocaleLowerCase();
  const remoteRef = remoteBranch[1];
  if (!branchSha || remoteRef !== `refs/heads/${branch}`) {
    throw new Error("Unable to resolve the exact requested remote branch.");
  }
  if (headSha !== commitSha || branchSha !== commitSha) {
    throw new Error(
      "Checked-out HEAD, requested commit, and remote branch head must match exactly.",
    );
  }

  const migrations = await migrationDirectories();
  const repositoryHead = migrations.at(-1);
  if (repositoryHead !== expectedHead) {
    throw new Error(
      `Requested migration head does not match repository head ${repositoryHead ?? "(none)"}.`,
    );
  }

  const client = new Client({
    connectionString: environment.directDatabaseUrl ?? environment.databaseUrl!,
    application_name: `travlebuddy_qa_migration_${phase}`,
  });
  await client.connect();
  let databaseState: MigrationDatabaseState;
  try {
    databaseState = await inspectDatabase(client, expectedHead);
  } finally {
    await client.end();
  }

  if (phase === "preflight") {
    assertMigrationPreflightState(databaseState);
  } else {
    if (
      !databaseState.hasLedger ||
      databaseState.failedMigrationCount > 0 ||
      !databaseState.expectedHeadApplied
    ) {
      throw new Error(
        "Postflight verification did not find a clean ledger at the expected migration head.",
      );
    }
  }

  const receiptDirectory = path.resolve("qa-results", "qa-migration");
  await mkdir(receiptDirectory, { recursive: true });
  const receipt = {
    receiptVersion: 1,
    phase,
    generatedAt: new Date().toISOString(),
    target: environment.target,
    qaOrigin: environment.baseUrl.origin,
    runId: environment.runId,
    commitSha,
    branch,
    databaseFingerprint: safety.databaseFingerprint,
    expectedMigrationHead: expectedHead,
    emptyFirstDeploy:
      !databaseState.hasLedger && databaseState.appTableCount === 0,
    ...databaseState,
  };
  await writeFile(
    path.join(receiptDirectory, `${phase}-receipt.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `QA migration ${phase} verified for ${commitSha.slice(0, 12)} at ${expectedHead}.\n`,
  );
}

main().catch(async (error) => {
  const phase = parseMigrationPhase(process.argv[2]);
  let sanitizedError = sanitizeMigrationError(error);
  try {
    const evidence = await writeMigrationFailureReceipt({ phase, error });
    sanitizedError = evidence.error;
  } catch (receiptError) {
    process.stderr.write(
      `Unable to write sanitized migration failure receipt: ${sanitizeMigrationError(receiptError)}\n`,
    );
  }
  process.stderr.write(`${sanitizedError}\n`);
  process.exitCode = 1;
});

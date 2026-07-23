import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertProductionReadOnly,
  assertQaWritesAllowed,
  readQaEnvironment,
} from "../runtime/environment";
import {
  cleanupQaFixtures,
  resetPreviewBaseline,
  safeRunId,
  seedQaFixtures,
} from "../runtime/fixtures";
import {
  createQaStorageState,
  createQaStorageStateFromSessionCookie,
  type QaSessionUser,
} from "../runtime/session";

type Suite = "critical" | "nightly" | "production";

async function main() {
  const suite = process.argv[2] as Suite | undefined;

if (!suite || !["critical", "nightly", "production"].includes(suite)) {
  throw new Error("Usage: tsx qa/cli/run-e2e.ts <critical|nightly|production>");
}

const environment = readQaEnvironment();
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

const authDirectory = path.resolve(
  process.cwd(),
  ".playwright-auth",
  safeRunId(environment.runId),
);
const ownerStatePath = path.join(authDirectory, "owner.json");
const attackerStatePath = path.join(authDirectory, "attacker.json");

async function writeState(file: string, user: QaSessionUser) {
  if (!authSecret || authSecret.length < 32) {
    throw new Error(
      "Local and preview E2E session setup requires AUTH_SECRET with at least 32 characters.",
    );
  }

  const state = await createQaStorageState({
    baseUrl: environment.baseUrl,
    secret: authSecret as string,
    user,
  });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

  await mkdir(authDirectory, { recursive: true });

let manifest: Awaited<ReturnType<typeof seedQaFixtures>> | null = null;

if (suite === "production") {
  assertProductionReadOnly(environment);
  const cookieValue = process.env.QA_SYNTHETIC_AUTH_COOKIE;

  if (!cookieValue) {
    throw new Error(
      "Production authenticated smoke requires QA_SYNTHETIC_AUTH_COOKIE.",
    );
  }

  const state = createQaStorageStateFromSessionCookie({
    baseUrl: environment.baseUrl,
    cookieValue,
  });
  await writeFile(ownerStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
} else {
  assertQaWritesAllowed(environment);
  if (
    suite === "nightly" &&
    environment.target === "preview" &&
    process.env.QA_RESET_BASELINE === "true"
  ) {
    await resetPreviewBaseline(environment);
  }
  manifest = await seedQaFixtures(environment);
  await Promise.all([
    writeState(ownerStatePath, manifest.owner),
    writeState(attackerStatePath, manifest.attacker),
  ]);
}

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const args = [playwrightCli, "test"];

if (suite === "critical") {
  args.push("--project=chromium", "--grep=@critical");
} else if (suite === "nightly") {
  args.push("--grep=@(critical|nightly)");
} else {
  args.push(
    "e2e/production-smoke.spec.ts",
    "--project=chromium",
    "--grep=@production-readonly",
  );
}

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    QA_OWNER_STATE_PATH: ownerStatePath,
    QA_ATTACKER_STATE_PATH: attackerStatePath,
  },
  stdio: "inherit",
});

try {
  if (result.status === 0 && manifest) {
    await cleanupQaFixtures(environment, manifest);
  } else if (result.status !== 0 && manifest) {
    process.stderr.write(
      `QA fixtures retained until ${manifest.retainUntil} for run ${manifest.runId}.\n`,
    );
  }
} finally {
  await rm(authDirectory, { recursive: true, force: true });
}

  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

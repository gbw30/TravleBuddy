import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  featureIdSchema,
  featureRegistryById,
  featureStateSchema,
  qaRunReportSchema,
  validateFeatureTransition,
} from "../contracts";

async function main() {
  const args = process.argv.slice(2);
const featureId = featureIdSchema.parse(args[0]);
const nextState = featureStateSchema.parse(args[1]);
const apply = args.includes("--apply");
const reportFlag = args.indexOf("--report");
const reportPath = reportFlag >= 0 ? args[reportFlag + 1] : undefined;
const current = featureRegistryById.get(featureId);

if (!current) {
  throw new Error(`Unknown feature: ${featureId}`);
}

let gateVerdict: "PASS" | "FAIL" | "BLOCKED" | undefined;

if (reportPath) {
  const report = qaRunReportSchema.parse(
    JSON.parse(await readFile(path.resolve(reportPath), "utf8")),
  );
  gateVerdict = report.decision.verdict;

  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const headSha = head.stdout.trim();

  if (
    head.status !== 0 ||
    (!headSha.startsWith(report.commitSha) &&
      !report.commitSha.startsWith(headSha))
  ) {
    throw new Error("The gate report does not belong to the current commit.");
  }
}

validateFeatureTransition(current.state, nextState, { gateVerdict });

if (!apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "validated",
        feature: featureId,
        from: current.state,
        to: nextState,
        gateVerdict: gateVerdict ?? null,
        applied: false,
        next: "Repeat with --apply to update qa/feature-states.json.",
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const statePath = path.resolve("qa", "feature-states.json");
const states = JSON.parse(await readFile(statePath, "utf8")) as Record<
  string,
  string
>;
states[featureId] = nextState;
  await writeFile(statePath, `${JSON.stringify(states, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "updated",
        feature: featureId,
        from: current.state,
        to: nextState,
        gateVerdict: gateVerdict ?? null,
        applied: true,
        manifest: "qa/feature-states.json",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

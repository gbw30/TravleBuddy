import {
  parseForcedAgents,
  readChangedPaths,
  readCommitSha,
  readParentSandbox,
  readRunType,
  writeQaContextBundles,
} from "../agent-system/context";
import { readQaEnvironment } from "../runtime/environment";

async function main() {
  const environment = readQaEnvironment();
  const production = environment.target === "production-readonly";
  const runType = readRunType(process.env.QA_RUN_TYPE, production);
  const changes =
    runType === "pr"
      ? readChangedPaths(process.env.QA_BASE_SHA)
      : { baseSha: null, changedPaths: null };
  const manifest = await writeQaContextBundles({
    runId: environment.runId,
    runType,
    targetKind:
      environment.target === "production-readonly"
        ? "production"
        : environment.target,
    activeStage: process.env.QA_ACTIVE_STAGE?.trim() || "current",
    commitSha: readCommitSha(),
    baseSha: changes.baseSha,
    changedPaths: changes.changedPaths,
    forcedAgents: parseForcedAgents(process.env.QA_FORCE_AGENTS),
    parentSandbox: readParentSandbox(process.env.QA_PARENT_SANDBOX),
    generatedAt: new Date().toISOString(),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ready",
        runId: manifest.runId,
        runType: manifest.runType,
        selectedAgents: manifest.selectedAgents,
        reasons: manifest.selectionReasons,
        contextBytesByAgent: manifest.contextBytesByAgent,
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

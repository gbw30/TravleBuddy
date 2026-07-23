import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { qaWorkerReportSchema, type QaWorkerReport } from "../contracts";
import { qaResultsDirectory } from "../runtime/fixtures";
import { writeQaContextBundles } from "./context";
import {
  createEvidenceIndexEntries,
  validateAndSummarizeWorkerReports,
} from "./reports";

const createdRuns: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdRuns.splice(0).map((runId) =>
      rm(qaResultsDirectory(runId), { recursive: true, force: true }),
    ),
  );
});

function baselineReport(runId: string, evidencePath: string): QaWorkerReport {
  return qaWorkerReportSchema.parse({
    reportVersion: 1,
    runId,
    generatedAt: "2026-07-21T00:00:00.000Z",
    commitSha: "abcdef0",
    runType: "pr",
    target: {
      kind: "local",
      baseUrl: "http://127.0.0.1:3000",
      databaseFingerprint: null,
      writesAllowed: false,
      safetyVerified: true,
    },
    agent: "qa_baseline",
    verdict: "PASS",
    assignedScenarioIds: [],
    scenarioExecutions: [],
    findings: [],
    environmentBlockers: [],
    flakyScenarioIds: [],
    sourcePaths: ["qa-results/test/deterministic/report.json"],
    evidencePaths: [evidencePath],
    redactionConfirmed: true,
    usage: {
      wallTimeMs: 12,
      artifactBytes: 0,
      scenarioCount: 0,
      duplicateFindingCount: 0,
      uniqueConfirmedFindingCount: 0,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
    },
  });
}

describe("QA report summaries", () => {
  test("hashes evidence, verifies text redaction, and creates a compact summary", async () => {
    const runId = `report-summary-${process.pid}-${Date.now()}`;
    createdRuns.push(runId);
    const runRoot = qaResultsDirectory(runId);
    await writeQaContextBundles({
      runId,
      runType: "pr",
      targetKind: "local",
      activeStage: "current",
      commitSha: "abcdef0",
      baseSha: "1234567",
      changedPaths: [],
      forcedAgents: [],
      parentSandbox: "workspace-write",
      generatedAt: "2026-07-21T00:00:00.000Z",
    });

    const agentDirectory = path.join(runRoot, "agents", "qa_baseline");
    const evidenceFile = path.join(agentDirectory, "baseline.log");
    await mkdir(agentDirectory, { recursive: true });
    await writeFile(evidenceFile, "deterministic checks passed\n", "utf8");
    const evidencePath = path.relative(process.cwd(), evidenceFile);
    await writeFile(
      path.join(agentDirectory, "report.json"),
      `${JSON.stringify(baselineReport(runId, evidencePath), null, 2)}\n`,
      "utf8",
    );

    const summary = await validateAndSummarizeWorkerReports(runId);
    expect(summary.missingReports).toEqual([]);
    expect(summary.invalidReports).toEqual([]);
    expect(summary.workers[0]).toMatchObject({
      agent: "qa_baseline",
      status: "PASS",
      evidenceCount: 1,
      usage: { inputTokens: null, artifactBytes: 28 },
    });
  });

  test("rejects text evidence containing a recognizable unredacted secret", async () => {
    const runId = `report-secret-${process.pid}-${Date.now()}`;
    createdRuns.push(runId);
    const runRoot = qaResultsDirectory(runId);
    const agentDirectory = path.join(runRoot, "agents", "qa_baseline");
    const evidenceFile = path.join(agentDirectory, "unsafe.log");
    await mkdir(agentDirectory, { recursive: true });
    await writeFile(
      evidenceFile,
      "Bearer abc.def.ghi must not be persisted\n",
      "utf8",
    );
    const report = baselineReport(
      runId,
      path.relative(process.cwd(), evidenceFile),
    );

    await expect(
      createEvidenceIndexEntries({ runRoot, report }),
    ).rejects.toThrow(/unredacted secret/);
  });
});

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  qaAgentContextSchema,
  qaContextManifestSchema,
  qaEvidenceIndexEntrySchema,
  qaEvidenceIndexSchema,
  qaRunSummarySchema,
  qaWorkerAgentSchema,
  qaWorkerReportSchema,
  qaWorkerSummarySchema,
  redactString,
  type QaAgentContext,
  type QaEvidenceIndexEntry,
  type QaUsageMetric,
  type QaWorkerAgent,
  type QaWorkerReport,
} from "../contracts";
import { featureRegistryById, isBlockingFeatureState } from "../contracts/features";
import { scenarioCatalog } from "../scenarios";
import { qaResultsDirectory } from "../runtime/fixtures";

const textExtensions = new Set([
  ".json",
  ".md",
  ".txt",
  ".log",
  ".xml",
  ".html",
  ".csv",
]);

const mediaTypes: Record<string, string> = {
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "video/webm",
  ".zip": "application/zip",
};

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function resolveEvidencePath(runRoot: string, evidencePath: string) {
  if (path.isAbsolute(evidencePath)) {
    throw new Error(`Evidence paths must be repository-relative: ${evidencePath}`);
  }
  const resolved = path.resolve(process.cwd(), evidencePath);
  const relative = path.relative(runRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Evidence path is outside the active QA run: ${evidencePath}`);
  }
  return resolved;
}

function evidenceScenarioMap(report: QaWorkerReport) {
  const map = new Map<string, Set<string>>();
  const add = (evidencePath: string, scenarioId?: string) => {
    const scenarios = map.get(evidencePath) ?? new Set<string>();
    if (scenarioId) scenarios.add(scenarioId);
    map.set(evidencePath, scenarios);
  };

  for (const evidencePath of report.evidencePaths) add(evidencePath);
  for (const execution of report.scenarioExecutions) {
    for (const evidencePath of execution.evidencePaths) {
      add(evidencePath, execution.scenarioId);
    }
  }
  for (const finding of report.findings) {
    for (const evidencePath of finding.evidencePaths) {
      add(evidencePath, finding.scenarioId);
    }
  }
  return map;
}

export async function createEvidenceIndexEntries(options: {
  runRoot: string;
  report: QaWorkerReport;
}): Promise<QaEvidenceIndexEntry[]> {
  const entries: QaEvidenceIndexEntry[] = [];
  for (const [evidencePath, scenarioIds] of evidenceScenarioMap(
    options.report,
  )) {
    const resolved = resolveEvidencePath(options.runRoot, evidencePath);
    const file = await stat(resolved);
    if (!file.isFile()) throw new Error(`Evidence is not a file: ${evidencePath}`);

    const extension = path.extname(resolved).toLocaleLowerCase();
    let redactionState: QaEvidenceIndexEntry["redactionState"] =
      options.report.redactionConfirmed ? "reported" : "unknown";
    if (textExtensions.has(extension) && file.size <= 1024 * 1024) {
      const contents = await readFile(resolved, "utf8");
      if (redactString(contents) !== contents) {
        throw new Error(`Evidence appears to contain an unredacted secret: ${evidencePath}`);
      }
      redactionState = "verified";
    }

    entries.push(
      qaEvidenceIndexEntrySchema.parse({
        path: evidencePath.replaceAll("\\", "/"),
        owner: options.report.agent,
        scenarioIds: [...scenarioIds].sort(),
        mediaType: mediaTypes[extension] ?? "application/octet-stream",
        bytes: file.size,
        sha256: await sha256File(resolved),
        redactionState,
      }),
    );
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function derivedUsage(
  report: QaWorkerReport,
  artifactBytes: number,
): QaUsageMetric {
  return {
    wallTimeMs:
      report.usage?.wallTimeMs ??
      report.scenarioExecutions.reduce(
        (total, execution) => total + execution.durationMs,
        0,
      ),
    artifactBytes,
    scenarioCount: report.scenarioExecutions.length,
    duplicateFindingCount: report.findings.filter(
      (finding) => finding.duplicateOf !== null,
    ).length,
    uniqueConfirmedFindingCount: report.findings.filter(
      (finding) =>
        finding.confidence === "confirmed" && finding.duplicateOf === null,
    ).length,
    inputTokens: report.usage?.inputTokens ?? null,
    outputTokens: report.usage?.outputTokens ?? null,
    cachedInputTokens: report.usage?.cachedInputTokens ?? null,
  };
}

function primaryEvidenceForReport(report: QaWorkerReport) {
  const findingIds = report.findings
    .filter(
      (finding) =>
        finding.confidence === "confirmed" ||
        report.agent === "qa_security_concurrency" ||
        report.agent === "qa_resilience_production",
    )
    .map((finding) => finding.id);
  const scenarioIds = report.scenarioExecutions
    .filter(
      (execution) =>
        execution.status === "failed" ||
        execution.status === "blocked" ||
        execution.attempts > 1,
    )
    .map((execution) => execution.scenarioId);

  const p0Sample = report.assignedScenarioIds.find((scenarioId) => {
    const scenario = scenarioCatalog.find((entry) => entry.id === scenarioId);
    const feature = scenario
      ? featureRegistryById.get(scenario.feature)
      : undefined;
    return (
      scenario?.priority === "P0" &&
      feature !== undefined &&
      isBlockingFeatureState(feature.state)
    );
  });
  if (p0Sample) scenarioIds.push(p0Sample);

  return {
    findingIds,
    scenarioIds,
  };
}

async function readAgentContext(
  manifest: ReturnType<typeof qaContextManifestSchema.parse>,
  worker: QaWorkerAgent,
) {
  const contextPath = manifest.agentBundlePaths[worker];
  if (!contextPath) throw new Error(`Context manifest omitted ${worker}.`);
  return qaAgentContextSchema.parse(
    JSON.parse(await readFile(path.resolve(contextPath), "utf8")),
  );
}

function validateReportIdentity(options: {
  manifest: ReturnType<typeof qaContextManifestSchema.parse>;
  context: QaAgentContext;
  report: QaWorkerReport;
  worker: QaWorkerAgent;
}) {
  const { manifest, context, report, worker } = options;
  if (report.agent !== worker) throw new Error(`Report agent must be ${worker}.`);
  if (report.runId !== manifest.runId) throw new Error("Report run ID mismatch.");
  if (report.commitSha !== manifest.commitSha) {
    throw new Error("Report commit SHA mismatch.");
  }
  if (report.runType !== manifest.runType) throw new Error("Report run type mismatch.");
  if (report.target.kind !== manifest.targetKind) {
    throw new Error("Report target kind mismatch.");
  }
  const expected = context.assignedScenarios.map((scenario) => scenario.id);
  if (!sameMembers(report.assignedScenarioIds, expected)) {
    throw new Error("Report assigned scenarios do not match its context bundle.");
  }
}

export async function validateAndSummarizeWorkerReports(runId: string) {
  const runRoot = qaResultsDirectory(runId);
  const manifestPath = path.join(runRoot, "context", "run.json");
  const manifest = qaContextManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const selectedWorkers = manifest.selectedAgents.flatMap((agent) => {
    const parsed = qaWorkerAgentSchema.safeParse(agent);
    return parsed.success ? [parsed.data] : [];
  });
  const summaries = [];
  const evidenceEntries: QaEvidenceIndexEntry[] = [];
  const missingReports: QaWorkerAgent[] = [];
  const invalidReports: QaWorkerAgent[] = [];
  const primaryEvidenceFindingIds: string[] = [];
  const primaryEvidenceScenarioIds: string[] = [];

  for (const worker of selectedWorkers) {
    const reportPath = path.join(runRoot, "agents", worker, "report.json");
    const relativeReportPath = path.relative(process.cwd(), reportPath);
    let rawReport: string;
    try {
      rawReport = await readFile(reportPath, "utf8");
    } catch {
      missingReports.push(worker);
      summaries.push(
        qaWorkerSummarySchema.parse({
          agent: worker,
          status: "MISSING",
          assignedScenarioCount: 0,
          executedScenarioCount: 0,
          findingIds: [],
          confirmedFindingIds: [],
          flakyScenarioIds: [],
          blockerIds: [],
          evidenceCount: 0,
          reportPath: relativeReportPath,
          error: "Worker report was not found.",
          usage: null,
        }),
      );
      continue;
    }

    try {
      const report = qaWorkerReportSchema.parse(JSON.parse(rawReport));
      const context = await readAgentContext(manifest, worker);
      validateReportIdentity({ manifest, context, report, worker });
      const entries = await createEvidenceIndexEntries({ runRoot, report });
      evidenceEntries.push(...entries);
      const primary = primaryEvidenceForReport(report);
      primaryEvidenceFindingIds.push(...primary.findingIds);
      primaryEvidenceScenarioIds.push(...primary.scenarioIds);
      summaries.push(
        qaWorkerSummarySchema.parse({
          agent: worker,
          status: report.verdict,
          assignedScenarioCount: report.assignedScenarioIds.length,
          executedScenarioCount: report.scenarioExecutions.length,
          findingIds: report.findings.map((finding) => finding.id),
          confirmedFindingIds: report.findings
            .filter((finding) => finding.confidence === "confirmed")
            .map((finding) => finding.id),
          flakyScenarioIds: report.flakyScenarioIds,
          blockerIds: report.environmentBlockers.map((blocker) => blocker.id),
          evidenceCount: entries.length,
          reportPath: relativeReportPath,
          error: null,
          usage: derivedUsage(
            report,
            entries.reduce((total, entry) => total + entry.bytes, 0),
          ),
        }),
      );
    } catch (error) {
      invalidReports.push(worker);
      summaries.push(
        qaWorkerSummarySchema.parse({
          agent: worker,
          status: "INVALID",
          assignedScenarioCount: 0,
          executedScenarioCount: 0,
          findingIds: [],
          confirmedFindingIds: [],
          flakyScenarioIds: [],
          blockerIds: [],
          evidenceCount: 0,
          reportPath: relativeReportPath,
          error: error instanceof Error ? error.message : String(error),
          usage: null,
        }),
      );
    }
  }

  const summaryDirectory = path.join(runRoot, "summary");
  await mkdir(summaryDirectory, { recursive: true });
  const generatedAt = new Date().toISOString();
  const evidenceIndexPath = path.join(summaryDirectory, "evidence-index.json");
  const evidenceIndex = qaEvidenceIndexSchema.parse({
    contractVersion: 1,
    runId: manifest.runId,
    generatedAt,
    entries: evidenceEntries,
  });
  await writeFile(
    evidenceIndexPath,
    `${JSON.stringify(evidenceIndex, null, 2)}\n`,
    "utf8",
  );

  const summary = qaRunSummarySchema.parse({
    contractVersion: 1,
    runId: manifest.runId,
    generatedAt,
    commitSha: manifest.commitSha,
    runType: manifest.runType,
    selectedAgents: manifest.selectedAgents,
    workers: summaries,
    missingReports,
    invalidReports,
    primaryEvidenceFindingIds: [...new Set(primaryEvidenceFindingIds)],
    primaryEvidenceScenarioIds: [...new Set(primaryEvidenceScenarioIds)],
    evidenceIndexPath: path.relative(process.cwd(), evidenceIndexPath),
  });
  await writeFile(
    path.join(summaryDirectory, "run-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  return summary;
}

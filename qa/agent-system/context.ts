import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  featureRegistryById,
  isBlockingFeatureState,
  qaAgentContextSchema,
  qaContextManifestSchema,
  qaRunTypeSchema,
  type QaAgent,
  type QaAgentContext,
  type QaContextManifest,
  type QaEnvironment,
  type QaParentSandbox,
  type QaRunType,
} from "../contracts";
import { scenarioCatalog } from "../scenarios";
import { qaResultsDirectory } from "../runtime/fixtures";
import {
  agentRegistryByName,
  parseForcedAgents,
  qaContextMaxBytes,
  selectAgentsForChanges,
} from "./registry";

export type ContextRunOptions = {
  runId: string;
  runType: QaRunType;
  targetKind: QaEnvironment;
  activeStage: string;
  commitSha: string;
  baseSha: string | null;
  changedPaths: string[] | null;
  forcedAgents: QaAgent[];
  parentSandbox: QaParentSandbox;
  generatedAt?: string;
};

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

export function serializeBoundedContext(
  context: QaAgentContext,
  maximumBytes = qaContextMaxBytes,
) {
  const serialized = `${JSON.stringify(qaAgentContextSchema.parse(context), null, 2)}\n`;
  const bytes = Buffer.byteLength(serialized, "utf8");

  if (bytes > maximumBytes) {
    throw new Error(
      `Context bundle for ${context.agent} is ${bytes} bytes; maximum is ${maximumBytes}. Move detail to referenced evidence instead of truncating it.`,
    );
  }

  return { serialized, bytes };
}

export function buildAgentContext(options: {
  run: ContextRunOptions;
  selectedAgents: readonly QaAgent[];
  selectionReasons: readonly string[];
  agent: QaAgent;
}): QaAgentContext {
  const definition = agentRegistryByName.get(options.agent);
  if (!definition) throw new Error(`Missing agent definition: ${options.agent}`);

  const assignedScenarios = scenarioCatalog.filter(
    (scenario) =>
      scenario.owningAgent === options.agent &&
      scenario.environments.includes(options.run.targetKind),
  );
  const relevantFeatures = unique(
    assignedScenarios.map((scenario) => scenario.feature),
  ).map((featureId) => {
    const feature = featureRegistryById.get(featureId);
    if (!feature) throw new Error(`Missing feature definition: ${featureId}`);
    return feature;
  });
  const blockingScenarioIds = assignedScenarios
    .filter((scenario) => {
      const feature = featureRegistryById.get(scenario.feature);
      return feature ? isBlockingFeatureState(feature.state) : false;
    })
    .map((scenario) => scenario.id);
  const runRoot = path.relative(process.cwd(), qaResultsDirectory(options.run.runId));
  const isAuditor = options.agent === "qa_auditor";

  return qaAgentContextSchema.parse({
    contractVersion: 1,
    runId: options.run.runId,
    generatedAt: options.run.generatedAt ?? new Date().toISOString(),
    commitSha: options.run.commitSha,
    activeStage: options.run.activeStage,
    runType: options.run.runType,
    targetKind: options.run.targetKind,
    agent: options.agent,
    selectedAgents: options.selectedAgents,
    selectionReasons: options.selectionReasons,
    assignedScenarios,
    blockingScenarioIds,
    relevantFeatures,
    documentationPaths: definition.documentationPaths,
    sourceRoots: definition.sourceRoots,
    testRoots: definition.testRoots,
    evidenceInputs: isAuditor
      ? [
          `${runRoot}/summary/run-summary.json`,
          `${runRoot}/summary/evidence-index.json`,
          `${runRoot}/agents/`,
          `${runRoot}/deterministic/report.json`,
        ]
      : [`${runRoot}/deterministic/report.json`],
    outputDirectory: `${runRoot}/agents/${options.agent}`,
    exclusions: [
      "Do not edit tracked files or repair defects during verification.",
      "Do not load complete logs, traces, screenshots, or videos unless a summary identifies them as primary evidence.",
      "Do not treat planned or deferred behavior as gate-blocking.",
      "Do not expose secrets, cookies, tokens, database URLs, private data, or hidden reasoning.",
    ],
    permissions: {
      reportOnly: true,
      trackedWritesAllowed: false,
      productionReadOnly: options.run.targetKind === "production",
      parentSandbox: options.run.parentSandbox,
      outputMode:
        options.run.parentSandbox === "read-only"
          ? "final-response"
          : "artifacts",
    },
  });
}

export async function writeQaContextBundles(
  run: ContextRunOptions,
): Promise<QaContextManifest> {
  const selection = selectAgentsForChanges({
    runType: run.runType,
    changedPaths: run.changedPaths,
    forcedAgents: run.forcedAgents,
  });
  const contextDirectory = path.join(
    qaResultsDirectory(run.runId),
    "context",
  );
  const agentDirectory = path.join(contextDirectory, "agents");
  await mkdir(agentDirectory, { recursive: true });

  const agentBundlePaths: Partial<Record<QaAgent, string>> = {};
  const contextBytesByAgent: Partial<Record<QaAgent, number>> = {};
  for (const agent of selection.selectedAgents) {
    const context = buildAgentContext({
      run,
      selectedAgents: selection.selectedAgents,
      selectionReasons: selection.reasons,
      agent,
    });
    const { serialized, bytes } = serializeBoundedContext(context);
    const filePath = path.join(agentDirectory, `${agent}.json`);
    await writeFile(filePath, serialized, "utf8");
    agentBundlePaths[agent] = path.relative(process.cwd(), filePath);
    contextBytesByAgent[agent] = bytes;
  }

  const manifest = qaContextManifestSchema.parse({
    contractVersion: 1,
    runId: run.runId,
    generatedAt: run.generatedAt ?? new Date().toISOString(),
    commitSha: run.commitSha,
    activeStage: run.activeStage,
    runType: run.runType,
    targetKind: run.targetKind,
    baseSha: run.baseSha,
    changedPaths: run.changedPaths,
    selectedAgents: selection.selectedAgents,
    selectionReasons: selection.reasons,
    forcedAgents: selection.forcedAgents,
    deterministicReportPath: path.join(
      path.relative(process.cwd(), qaResultsDirectory(run.runId)),
      "deterministic",
      "report.json",
    ),
    agentBundlePaths,
    contextBytesByAgent,
  });
  await writeFile(
    path.join(contextDirectory, "run.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

export function readRunType(value: string | undefined, production: boolean) {
  return qaRunTypeSchema.parse(value ?? (production ? "production" : "pr"));
}

export function readParentSandbox(value: string | undefined): QaParentSandbox {
  if (!value) return "workspace-write";
  if (value === "workspace-write" || value === "read-only") return value;
  throw new Error("QA_PARENT_SANDBOX must be workspace-write or read-only.");
}

export function readCommitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const commitSha = result.stdout.trim();
  if (result.status !== 0 || !/^[a-fA-F0-9]{7,40}$/.test(commitSha)) {
    throw new Error("Unable to resolve the current commit SHA for QA context.");
  }
  return commitSha;
}

export function readChangedPaths(baseSha: string | undefined) {
  if (!baseSha) return { baseSha: null, changedPaths: null };
  if (!/^[a-fA-F0-9]{7,40}$/.test(baseSha)) {
    throw new Error("QA_BASE_SHA must be a 7-40 character hexadecimal Git SHA.");
  }

  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", `${baseSha}...HEAD`],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { baseSha: null, changedPaths: null };
  }

  return {
    baseSha,
    changedPaths: result.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

export { parseForcedAgents };

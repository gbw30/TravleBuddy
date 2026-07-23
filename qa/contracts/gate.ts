import {
  gateDecisionSchema,
  qaRunEvidenceSchema,
  qaRunReportSchema,
  scenarioCatalogSchema,
  type FeatureDefinition,
  type FeatureId,
  type GateDecision,
  type QaRunEvidence,
  type QaRunReport,
  type Scenario,
} from "./schemas";
import {
  featureRegistry,
  isBlockingFeatureState,
} from "./features";
import { scenarioCatalog } from "../scenarios/catalog";

export interface EvaluateGateOptions {
  now?: Date;
  features?: readonly FeatureDefinition[];
  scenarios?: readonly Scenario[];
}

const severeForRun = {
  pr: new Set(["blocker", "critical"]),
  nightly: new Set(["blocker", "critical", "major"]),
  release: new Set(["blocker", "critical", "major"]),
  production: new Set(["blocker", "critical"]),
} as const;

function unique(values: string[]) {
  return [...new Set(values)];
}

export function evaluateGate(
  input: QaRunEvidence,
  options: EvaluateGateOptions = {},
): GateDecision {
  const evidence = qaRunEvidenceSchema.parse(input);
  const scenarios = scenarioCatalogSchema.parse(
    options.scenarios ?? scenarioCatalog,
  );
  const features = options.features ?? featureRegistry;
  const now = options.now ?? new Date();

  const scenariosById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const featuresById = new Map<FeatureId, FeatureDefinition>(
    features.map((feature) => [feature.id, feature]),
  );
  const executionByScenario = new Map(
    evidence.scenarioExecutions.map((execution) => [
      execution.scenarioId,
      execution,
    ]),
  );

  const failReasons: string[] = [];
  const blockedReasons: string[] = [];
  const blockingScenarioIds: string[] = [];
  const nonBlockingFindingIds: string[] = [];

  const isBlockingScenario = (scenario: Scenario | undefined) => {
    if (!scenario || !scenario.environments.includes(evidence.target.kind)) {
      return false;
    }
    const feature = featuresById.get(scenario.feature);
    return feature ? isBlockingFeatureState(feature.state) : false;
  };

  if (!evidence.target.safetyVerified) {
    const reason = "QA target safety was not verified";
    if (evidence.runType === "release") {
      failReasons.push(reason);
    } else {
      blockedReasons.push(reason);
    }
  }

  if (evidence.target.kind === "production" && evidence.target.writesAllowed) {
    failReasons.push("Production QA target must be read-only");
  }

  if (
    evidence.target.writesAllowed &&
    evidence.target.databaseFingerprint === null
  ) {
    blockedReasons.push(
      "A writable QA target requires a verified database fingerprint",
    );
  }

  if (evidence.runType === "production" && evidence.target.kind !== "production") {
    failReasons.push("Production runs must target the production URL class");
  }

  for (const command of evidence.commands) {
    if (command.status === "failed") {
      failReasons.push(`Verification command failed: ${command.name}`);
    } else if (command.status === "blocked") {
      blockedReasons.push(`Verification command was blocked: ${command.name}`);
    }
  }

  if (evidence.coverage.total !== evidence.scenarioExecutions.length) {
    failReasons.push(
      "Coverage total does not match the number of scenario executions",
    );
  }

  const actualCounts = evidence.scenarioExecutions.reduce(
    (counts, execution) => {
      counts[execution.status] += 1;
      return counts;
    },
    { passed: 0, failed: 0, blocked: 0, skipped: 0 },
  );
  for (const status of ["passed", "failed", "blocked", "skipped"] as const) {
    if (actualCounts[status] !== evidence.coverage[status]) {
      failReasons.push(`Coverage ${status} count does not match executions`);
    }
  }

  if (executionByScenario.size !== evidence.scenarioExecutions.length) {
    failReasons.push("A scenario has more than one execution result");
  }

  for (const execution of evidence.scenarioExecutions) {
    const scenario = scenariosById.get(execution.scenarioId);
    if (!scenario) {
      failReasons.push(`Execution references unknown scenario ${execution.scenarioId}`);
      continue;
    }

    if (execution.environment !== evidence.target.kind) {
      failReasons.push(
        `Scenario ${scenario.id} result does not match the target environment`,
      );
      continue;
    }

    if (!scenario.environments.includes(execution.environment)) {
      failReasons.push(
        `Scenario ${scenario.id} is not valid for ${execution.environment}`,
      );
      continue;
    }

    if (!isBlockingScenario(scenario)) {
      continue;
    }

    if (execution.status === "blocked") {
      blockedReasons.push(
        `Required scenario ${scenario.id} was blocked: ${execution.blockingReason}`,
      );
      blockingScenarioIds.push(scenario.id);
    }

    const deterministic = !["agent", "manual"].includes(
      scenario.executionKind,
    );
    const deterministicRun = ["pr", "nightly", "production"].includes(
      evidence.runType,
    );
    const failedReleaseP0 =
      evidence.runType === "release" && scenario.priority === "P0";

    if (
      execution.status === "failed" &&
      ((deterministicRun && deterministic) || failedReleaseP0)
    ) {
      failReasons.push(`Required scenario failed: ${scenario.id}`);
      blockingScenarioIds.push(scenario.id);
    }
  }

  for (const finding of evidence.findings) {
    const scenario = scenariosById.get(finding.scenarioId);
    if (!scenario) {
      failReasons.push(`Finding ${finding.id} references an unknown scenario`);
      continue;
    }

    const blocks =
      finding.duplicateOf === null &&
      finding.confidence === "confirmed" &&
      isBlockingScenario(scenario) &&
      severeForRun[evidence.runType].has(finding.severity);

    if (blocks) {
      failReasons.push(
        `Confirmed ${finding.severity} finding ${finding.id} blocks ${scenario.id}`,
      );
      blockingScenarioIds.push(scenario.id);
    } else {
      nonBlockingFindingIds.push(finding.id);
    }
  }

  for (const blocker of evidence.environmentBlockers) {
    if (!blocker.required) {
      continue;
    }

    const affectsBlockingCoverage =
      blocker.affectedScenarioIds.length === 0 ||
      blocker.affectedScenarioIds.some((scenarioId) =>
        isBlockingScenario(scenariosById.get(scenarioId)),
      );

    if (affectsBlockingCoverage) {
      blockedReasons.push(`${blocker.kind}: ${blocker.reason}`);
      blockingScenarioIds.push(...blocker.affectedScenarioIds);
    }
  }

  for (const skippedId of evidence.skippedScenarioIds) {
    if (!scenariosById.has(skippedId)) {
      failReasons.push(`Skipped list references unknown scenario ${skippedId}`);
    }
  }

  if (evidence.runType === "pr") {
    const requiredBrowserP0Scenarios = scenarios.filter(
      (scenario) =>
        scenario.priority === "P0" &&
        scenario.executionKind === "browser" &&
        scenario.environments.includes(evidence.target.kind) &&
        isBlockingScenario(scenario),
    );

    for (const scenario of requiredBrowserP0Scenarios) {
      const execution = executionByScenario.get(scenario.id);

      if (!execution || execution.status === "skipped") {
        failReasons.push(`Required PR P0 browser evidence is missing for ${scenario.id}`);
        blockingScenarioIds.push(scenario.id);
      }
    }
  }

  if (evidence.runType === "release") {
    const requiredP0Scenarios = scenarios.filter(
      (scenario) =>
        scenario.priority === "P0" &&
        scenario.environments.includes(evidence.target.kind) &&
        isBlockingScenario(scenario),
    );

    for (const scenario of requiredP0Scenarios) {
      const execution = executionByScenario.get(scenario.id);
      if (!execution || execution.status === "skipped") {
        failReasons.push(`Required P0 evidence is missing for ${scenario.id}`);
        blockingScenarioIds.push(scenario.id);
      }
    }

    for (const quarantine of evidence.quarantines) {
      const scenario = scenariosById.get(quarantine.scenarioId);
      if (!scenario) {
        failReasons.push(
          `Quarantine references unknown scenario ${quarantine.scenarioId}`,
        );
        continue;
      }

      if (new Date(quarantine.expiresAt).getTime() <= now.getTime()) {
        failReasons.push(`Quarantine expired for ${scenario.id}`);
        blockingScenarioIds.push(scenario.id);
      }

      const result = executionByScenario.get(scenario.id);
      if (
        ["P0", "P1"].includes(scenario.priority) &&
        (!result || result.status !== "passed")
      ) {
        failReasons.push(
          `Quarantine cannot hide ${scenario.priority} release coverage for ${scenario.id}`,
        );
        blockingScenarioIds.push(scenario.id);
      }
    }
  }

  let verdict: GateDecision["verdict"] = "PASS";
  let reasons: string[] = [];
  if (failReasons.length > 0) {
    verdict = "FAIL";
    reasons = unique(failReasons);
  } else if (blockedReasons.length > 0) {
    verdict = "BLOCKED";
    reasons = unique(blockedReasons);
  }

  return gateDecisionSchema.parse({
    verdict,
    reasons,
    blockingScenarioIds: unique(blockingScenarioIds),
    nonBlockingFindingIds: unique(nonBlockingFindingIds),
  });
}

export function buildQaRunReport(
  evidence: QaRunEvidence,
  options: EvaluateGateOptions = {},
): QaRunReport {
  return qaRunReportSchema.parse({
    ...qaRunEvidenceSchema.parse(evidence),
    decision: evaluateGate(evidence, options),
  });
}

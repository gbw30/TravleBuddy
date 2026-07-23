import { describe, expect, it } from "vitest";
import type {
  FeatureDefinition,
  QaRunEvidence,
  Scenario,
} from "./schemas";
import { buildQaRunReport, evaluateGate } from "./gate";

const requiredFeature: FeatureDefinition = {
  id: "authentication",
  label: "Authentication",
  state: "required",
  documentedStage: "existing foundation",
  description: "Authentication behavior.",
};

const requiredScenario: Scenario = {
  id: "TEST-P0-REQUIRED",
  title: "Required deterministic scenario",
  feature: "authentication",
  documentedStage: "existing foundation",
  priority: "P0",
  environments: ["preview"],
  executionKind: "browser",
  destructive: false,
  fixtureProfile: "anonymous",
  owningAgent: "qa_journeys",
  tags: ["test"],
  expectedInvariants: ["The scenario passes."],
};

function evidence(
  overrides: Partial<QaRunEvidence> = {},
): QaRunEvidence {
  return {
    reportVersion: 1,
    runId: "qa-contract-test",
    generatedAt: "2026-07-21T00:00:00.000Z",
    commitSha: "abcdef0",
    activeStage: "existing foundation",
    runType: "pr",
    target: {
      kind: "preview",
      baseUrl: "https://qa.travlebuddy.example",
      databaseFingerprint: null,
      writesAllowed: false,
      safetyVerified: true,
    },
    commands: [],
    coverage: {
      total: 1,
      passed: 1,
      failed: 0,
      blocked: 0,
      skipped: 0,
    },
    scenarioExecutions: [
      {
        scenarioId: requiredScenario.id,
        environment: "preview",
        status: "passed",
        attempts: 1,
        durationMs: 10,
        evidencePaths: ["qa/reports/test.json"],
        details: "Passed.",
        blockingReason: null,
      },
    ],
    findings: [],
    skippedScenarioIds: [],
    environmentBlockers: [],
    quarantines: [],
    ...overrides,
  };
}

const gateOptions = {
  features: [requiredFeature],
  scenarios: [requiredScenario],
};

describe("QA gate decisions", () => {
  it("returns PASS for complete successful evidence", () => {
    expect(evaluateGate(evidence(), gateOptions)).toMatchObject({
      verdict: "PASS",
      reasons: [],
    });
  });

  it("returns FAIL for a deliberate deterministic required failure", () => {
    const input = evidence({
      coverage: {
        total: 1,
        passed: 0,
        failed: 1,
        blocked: 0,
        skipped: 0,
      },
      scenarioExecutions: [
        {
          ...evidence().scenarioExecutions[0],
          status: "failed",
          details: "Deliberate gate failure.",
        },
      ],
    });

    expect(evaluateGate(input, gateOptions)).toMatchObject({
      verdict: "FAIL",
      blockingScenarioIds: [requiredScenario.id],
    });
  });

  it("returns BLOCKED for unavailable required infrastructure", () => {
    const input = evidence({
      coverage: {
        total: 1,
        passed: 0,
        failed: 0,
        blocked: 1,
        skipped: 0,
      },
      scenarioExecutions: [
        {
          ...evidence().scenarioExecutions[0],
          status: "blocked",
          details: "Preview is unavailable.",
          blockingReason: "Preview deployment did not start.",
        },
      ],
      environmentBlockers: [
        {
          id: "BLOCK-PREVIEW-DOWN",
          kind: "deployment",
          reason: "Preview deployment did not start.",
          affectedScenarioIds: [requiredScenario.id],
          required: true,
        },
      ],
    });

    expect(evaluateGate(input, gateOptions)).toMatchObject({
      verdict: "BLOCKED",
      blockingScenarioIds: [requiredScenario.id],
    });
  });

  it("keeps a failing planned feature nonblocking", () => {
    const plannedFeature: FeatureDefinition = {
      ...requiredFeature,
      id: "conversation-persistence",
      label: "Conversation persistence",
      state: "planned",
      documentedStage: "Stage 1A",
    };
    const plannedScenario: Scenario = {
      ...requiredScenario,
      id: "TEST-P0-PLANNED",
      feature: "conversation-persistence",
      documentedStage: "Stage 1A",
    };
    const input = evidence({
      coverage: {
        total: 1,
        passed: 0,
        failed: 1,
        blocked: 0,
        skipped: 0,
      },
      scenarioExecutions: [
        {
          ...evidence().scenarioExecutions[0],
          scenarioId: plannedScenario.id,
          status: "failed",
          details: "Not implemented yet.",
        },
      ],
    });

    expect(
      evaluateGate(input, {
        features: [plannedFeature],
        scenarios: [plannedScenario],
      }).verdict,
    ).toBe("PASS");
  });

  it("makes the same scenario blocking once its feature is a candidate", () => {
    const candidateFeature: FeatureDefinition = {
      ...requiredFeature,
      id: "conversation-persistence",
      label: "Conversation persistence",
      state: "candidate",
      documentedStage: "Stage 1A",
    };
    const candidateScenario: Scenario = {
      ...requiredScenario,
      id: "TEST-P0-CANDIDATE",
      feature: "conversation-persistence",
      documentedStage: "Stage 1A",
    };
    const input = evidence({
      coverage: {
        total: 1,
        passed: 0,
        failed: 1,
        blocked: 0,
        skipped: 0,
      },
      scenarioExecutions: [
        {
          ...evidence().scenarioExecutions[0],
          scenarioId: candidateScenario.id,
          status: "failed",
          details: "Candidate regression.",
        },
      ],
    });

    expect(
      evaluateGate(input, {
        features: [candidateFeature],
        scenarios: [candidateScenario],
      }).verdict,
    ).toBe("FAIL");
  });

  it("blocks confirmed severe findings but reports suspected risks separately", () => {
    const confirmed = {
      id: "FIND-AUTH-BYPASS",
      severity: "critical" as const,
      confidence: "confirmed" as const,
      scenarioId: requiredScenario.id,
      environment: "preview" as const,
      expectedBehavior: "Anonymous access is rejected.",
      actualBehavior: "Anonymous access succeeded.",
      reproductionSteps: ["Open the protected route."],
      evidencePaths: ["qa/reports/auth-bypass.png"],
      affectedSurface: "Trip page",
      productionImpact: "Private trips could be exposed.",
      workaround: null,
      duplicateOf: null,
    };

    expect(
      evaluateGate(evidence({ findings: [confirmed] }), gateOptions).verdict,
    ).toBe("FAIL");

    const suspected = {
      ...confirmed,
      id: "FIND-AUTH-RISK",
      confidence: "medium" as const,
      evidencePaths: [],
    };
    const decision = evaluateGate(
      evidence({ findings: [suspected] }),
      gateOptions,
    );
    expect(decision.verdict).toBe("PASS");
    expect(decision.nonBlockingFindingIds).toEqual([suspected.id]);
  });

  it("fails a release that lacks required P0 evidence", () => {
    const input = evidence({
      runType: "release",
      coverage: {
        total: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
      },
      scenarioExecutions: [],
    });

    expect(evaluateGate(input, gateOptions)).toMatchObject({
      verdict: "FAIL",
      blockingScenarioIds: [requiredScenario.id],
    });
  });

  it("rejects a production target that permits writes", () => {
    const productionScenario: Scenario = {
      ...requiredScenario,
      id: "TEST-P0-PRODUCTION",
      environments: ["production"],
    };
    const input = evidence({
      runType: "production",
      target: {
        kind: "production",
        baseUrl: "https://travlebuddy.example",
        databaseFingerprint: null,
        writesAllowed: true,
        safetyVerified: true,
      },
      scenarioExecutions: [
        {
          ...evidence().scenarioExecutions[0],
          scenarioId: productionScenario.id,
          environment: "production",
        },
      ],
    });

    expect(
      evaluateGate(input, {
        features: [requiredFeature],
        scenarios: [productionScenario],
      }).verdict,
    ).toBe("FAIL");
  });

  it("builds a schema-validated final report", () => {
    const report = buildQaRunReport(evidence(), gateOptions);
    expect(report.decision.verdict).toBe("PASS");
    expect(report.reportVersion).toBe(1);
  });
});


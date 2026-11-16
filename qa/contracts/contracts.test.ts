import { describe, expect, it } from "vitest";
import {
  findingSchema,
  quarantineSchema,
  qaRunEvidenceSchema,
  scenarioCatalogSchema,
  scenarioSchema,
} from "./schemas";
import {
  featureRegistry,
  featureRegistryById,
  isBlockingFeatureState,
  validateFeatureTransition,
} from "./features";
import { redactSecrets, redactString } from "./redaction";
import { scenarioCatalog } from "../scenarios/catalog";

describe("QA contracts", () => {
  it("loads a complete, uniquely keyed feature registry", () => {
    expect(featureRegistry).toHaveLength(20);
    expect(featureRegistryById.size).toBe(featureRegistry.length);
    expect(featureRegistryById.get("authentication")?.state).toBe("required");
    expect(featureRegistryById.get("conversation-persistence")?.state).toBe(
      "planned",
    );
    expect(featureRegistryById.get("adaptive-planning")?.state).toBe(
      "candidate",
    );
    expect(featureRegistryById.get("durable-planning-jobs")?.state).toBe(
      "candidate",
    );
    expect(featureRegistryById.get("google-places")?.state).toBe("candidate");
    expect(featureRegistryById.get("maps")?.state).toBe("deferred");
  });

  it("treats only required and candidate features as blocking", () => {
    expect(isBlockingFeatureState("required")).toBe(true);
    expect(isBlockingFeatureState("candidate")).toBe(true);
    expect(isBlockingFeatureState("planned")).toBe(false);
    expect(isBlockingFeatureState("deferred")).toBe(false);
  });

  it("requires a passing gate before promoting a candidate", () => {
    expect(() =>
      validateFeatureTransition("candidate", "required", {
        gateVerdict: "PASS",
      }),
    ).not.toThrow();
    expect(() =>
      validateFeatureTransition("candidate", "required", {
        gateVerdict: "FAIL",
      }),
    ).toThrow(/only after a PASS gate/);
    expect(() => validateFeatureTransition("planned", "required")).toThrow(
      /Invalid feature state transition/,
    );
    expect(() => validateFeatureTransition("required", "planned")).toThrow(
      /Invalid feature state transition/,
    );
  });

  it("validates the committed catalog and rejects duplicate ids", () => {
    expect(scenarioCatalogSchema.parse(scenarioCatalog)).toHaveLength(
      scenarioCatalog.length,
    );
    expect(() =>
      scenarioCatalogSchema.parse([scenarioCatalog[0], scenarioCatalog[0]]),
    ).toThrow(/Duplicate scenario id/);
  });

  it("rejects destructive production scenarios", () => {
    const source = scenarioCatalog[0];
    expect(() =>
      scenarioSchema.parse({
        ...source,
        id: "QA-P0-UNSAFE",
        environments: ["production"],
        destructive: true,
      }),
    ).toThrow(/must never target production/);
  });

  it("requires evidence for confirmed findings", () => {
    expect(() =>
      findingSchema.parse({
        id: "FIND-NO-EVIDENCE",
        severity: "critical",
        confidence: "confirmed",
        scenarioId: "AUTH-P0-PROTECTION",
        environment: "preview",
        expectedBehavior: "Anonymous access is rejected.",
        actualBehavior: "Anonymous access succeeds.",
        reproductionSteps: ["Open the protected URL."],
        evidencePaths: [],
        affectedSurface: "Protected trip page",
        productionImpact: "Trip data can be disclosed.",
        workaround: null,
        duplicateOf: null,
      }),
    ).toThrow(/Confirmed findings require evidence/);
  });

  it("rejects internally inconsistent coverage totals", () => {
    expect(() =>
      qaRunEvidenceSchema.parse({
        reportVersion: 1,
        runId: "qa-invalid-coverage",
        generatedAt: "2026-07-21T00:00:00.000Z",
        commitSha: "abcdef0",
        activeStage: "Stage 0",
        runType: "pr",
        target: {
          kind: "local",
          baseUrl: "http://localhost:3000",
          databaseFingerprint: "a".repeat(64),
          writesAllowed: true,
          safetyVerified: true,
        },
        commands: [],
        coverage: {
          total: 2,
          passed: 1,
          failed: 0,
          blocked: 0,
          skipped: 0,
        },
        scenarioExecutions: [],
        findings: [],
        skippedScenarioIds: [],
        environmentBlockers: [],
        quarantines: [],
      }),
    ).toThrow(/Coverage total must equal/);
  });

  it("limits quarantines to seven days", () => {
    expect(() =>
      quarantineSchema.parse({
        scenarioId: "AUTH-P0-PROTECTION",
        reason: "Diagnosing a known browser flake.",
        createdAt: "2026-07-21T00:00:00.000Z",
        expiresAt: "2026-07-29T00:00:00.000Z",
        approvedBy: "qa-owner",
      }),
    ).toThrow(/within seven days/);

    expect(() =>
      quarantineSchema.parse({
        scenarioId: "AUTH-P0-PROTECTION",
        reason: "Diagnosing a known browser flake.",
        createdAt: "2026-07-21T00:00:00.000Z",
        expiresAt: "2026-07-28T00:00:00.000Z",
        approvedBy: "qa-owner",
      }),
    ).not.toThrow();
  });
});

describe("QA secret redaction", () => {
  it("redacts sensitive keys recursively without mutating ordinary metadata", () => {
    expect(
      redactSecrets({
        runId: "qa-safe",
        authSecret: "do-not-print",
        nested: {
          apiKey: "also-secret",
          count: 3,
        },
      }),
    ).toEqual({
      runId: "qa-safe",
      authSecret: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        count: 3,
      },
    });
  });

  it("redacts credentials, bearer tokens, provider keys, and explicit secrets", () => {
    const value = [
      "postgresql://qa:password@db.example/travlebuddy",
      "Bearer abc.def.ghi",
      "sk-1234567890abcdefghijkl",
      "AIza1234567890abcdefghijklmnop",
      "private-fixture-secret",
    ].join(" ");
    const result = redactString(value, ["private-fixture-secret"]);

    expect(result).not.toContain("password");
    expect(result).not.toContain("abc.def.ghi");
    expect(result).not.toContain("sk-1234567890abcdefghijkl");
    expect(result).not.toContain("AIza1234567890abcdefghijklmnop");
    expect(result).not.toContain("private-fixture-secret");
    expect(result).toContain("[REDACTED]");
  });
});

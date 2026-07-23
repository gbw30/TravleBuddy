import { describe, expect, test } from "vitest";
import { buildAgentContext, serializeBoundedContext } from "./context";

const run = {
  runId: "context-contract-test",
  runType: "pr" as const,
  targetKind: "local" as const,
  activeStage: "current",
  commitSha: "abcdef0",
  baseSha: "1234567",
  changedPaths: ["src/components/trips/trip-card.tsx"],
  forcedAgents: [],
  generatedAt: "2026-07-21T00:00:00.000Z",
};

describe("QA agent context", () => {
  test("switches output behavior with the inherited parent sandbox", () => {
    const writable = buildAgentContext({
      run: { ...run, parentSandbox: "workspace-write" },
      selectedAgents: ["qa_baseline", "qa_journeys", "qa_auditor"],
      selectionReasons: ["Journey change."],
      agent: "qa_journeys",
    });
    const readOnly = buildAgentContext({
      run: { ...run, parentSandbox: "read-only" },
      selectedAgents: ["qa_baseline", "qa_journeys", "qa_auditor"],
      selectionReasons: ["Journey change."],
      agent: "qa_journeys",
    });

    expect(writable.permissions.outputMode).toBe("artifacts");
    expect(readOnly.permissions.outputMode).toBe("final-response");
    expect(readOnly.permissions.trackedWritesAllowed).toBe(false);
  });

  test("includes only owned environment-compatible scenarios", () => {
    const context = buildAgentContext({
      run: { ...run, parentSandbox: "workspace-write" },
      selectedAgents: ["qa_baseline", "qa_constraints", "qa_auditor"],
      selectionReasons: ["Constraint change."],
      agent: "qa_constraints",
    });

    expect(context.assignedScenarios.length).toBeGreaterThan(0);
    expect(
      context.assignedScenarios.every(
        (scenario) =>
          scenario.owningAgent === "qa_constraints" &&
          scenario.environments.includes("local"),
      ),
    ).toBe(true);
  });

  test("fails instead of truncating an oversized context", () => {
    const context = buildAgentContext({
      run: { ...run, parentSandbox: "workspace-write" },
      selectedAgents: ["qa_baseline", "qa_auditor"],
      selectionReasons: ["Documentation change."],
      agent: "qa_baseline",
    });
    expect(() => serializeBoundedContext(context, 16)).toThrow(/maximum/);
  });
});

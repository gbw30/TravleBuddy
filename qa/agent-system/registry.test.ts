import { describe, expect, test } from "vitest";
import {
  fullAgentTeam,
  parseForcedAgents,
  selectAgentsForChanges,
} from "./registry";

describe("QA agent routing", () => {
  test("keeps documentation-only PRs on the minimal team", () => {
    expect(
      selectAgentsForChanges({
        runType: "pr",
        changedPaths: ["docs/ci-cd-tutorial.md"],
      }).selectedAgents,
    ).toEqual(["qa_baseline", "qa_auditor"]);
  });

  test("routes domain and UI changes to their owners", () => {
    expect(
      selectAgentsForChanges({
        runType: "pr",
        changedPaths: [
          "src/features/trips/validation.ts",
          "src/components/trips/trip-card.tsx",
        ],
      }).selectedAgents,
    ).toEqual([
      "qa_baseline",
      "qa_journeys",
      "qa_constraints",
      "qa_auditor",
    ]);
  });

  test("expands unknown, requirement, and three-domain changes to all agents", () => {
    for (const paths of [
      ["src/types/new-contract.ts"],
      ["docs/requirements.md"],
      [
        "src/components/trips/trip-card.tsx",
        "src/features/trips/validation.ts",
        "src/lib/authorization.ts",
      ],
    ]) {
      expect(
        selectAgentsForChanges({ runType: "pr", changedPaths: paths })
          .selectedAgents,
      ).toEqual(fullAgentTeam);
    }
  });

  test("falls back to all agents when the PR base is unavailable", () => {
    const selection = selectAgentsForChanges({
      runType: "pr",
      changedPaths: null,
    });
    expect(selection.selectedAgents).toEqual(fullAgentTeam);
    expect(selection.reasons.join(" ")).toMatch(/QA_BASE_SHA/);
  });

  test("uses fixed teams for full and production runs", () => {
    expect(
      selectAgentsForChanges({ runType: "release", changedPaths: [] })
        .selectedAgents,
    ).toEqual(fullAgentTeam);
    expect(
      selectAgentsForChanges({ runType: "production", changedPaths: [] })
        .selectedAgents,
    ).toEqual([
      "qa_security_concurrency",
      "qa_resilience_production",
      "qa_auditor",
    ]);
  });

  test("treats forced PR agents as additive and validates their names", () => {
    expect(parseForcedAgents("qa_constraints")).toEqual(["qa_constraints"]);
    expect(
      selectAgentsForChanges({
        runType: "pr",
        changedPaths: ["docs/ci-cd-tutorial.md"],
        forcedAgents: parseForcedAgents("qa_constraints"),
      }).selectedAgents,
    ).toEqual(["qa_baseline", "qa_constraints", "qa_auditor"]);
    expect(() => parseForcedAgents("qa_not_real")).toThrow();
  });
});

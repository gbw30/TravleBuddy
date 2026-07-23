import { describe, expect, test } from "vitest";
import {
  qaFixtureManifestPath,
  qaResultsDirectory,
  safeRunId,
} from "./fixtures";

describe("QA fixture identity", () => {
  test("normalizes run IDs into bounded artifact paths", () => {
    expect(safeRunId("PR 123 / attempt 2")).toBe("pr-123-attempt-2");
    expect(qaResultsDirectory("Run_123")).toMatch(/qa-results[\\/]run_123$/);
    expect(qaFixtureManifestPath("Run_123")).toMatch(
      /qa-results[\\/]run_123[\\/]fixtures\.json$/,
    );
  });

  test("rejects unusable run identifiers", () => {
    expect(() => safeRunId("!!")).toThrow("three safe characters");
  });
});


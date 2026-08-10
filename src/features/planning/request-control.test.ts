import { describe, expect, it } from "vitest";
import {
  bindPlanningMutationControl,
  parsePlanningMutationControl,
} from "./request-control";

describe("planning mutation request control", () => {
  it("requires a nonnegative integer revision and UUID operation ID", () => {
    expect(parsePlanningMutationControl({})).toMatchObject({
      success: false,
    });
    expect(
      parsePlanningMutationControl({
        expectedRevision: -1,
        operationId: "not-a-uuid",
      }),
    ).toMatchObject({ success: false });

    expect(
      parsePlanningMutationControl({
        expectedRevision: 4,
        operationId: " 00000000-0000-4000-8000-000000000001 ",
      }),
    ).toEqual({
      success: true,
      data: {
        expectedRevision: 4,
        operationId: "00000000-0000-4000-8000-000000000001",
      },
    });
  });

  it("produces the same SHA-256 binding for equivalent validated input", () => {
    const parsed = {
      expectedRevision: 2,
      operationId: "00000000-0000-4000-8000-000000000001",
    };
    const left = bindPlanningMutationControl(
      parsed,
      "recommendation_reject",
      {
        suggestionId: "suggestion_1",
        reason: "TOO_FAR",
        note: undefined,
      },
    );
    const right = bindPlanningMutationControl(
      parsed,
      "recommendation_reject",
      {
        reason: "TOO_FAR",
        suggestionId: "suggestion_1",
      },
    );

    expect(left.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(right.requestFingerprint).toBe(left.requestFingerprint);
  });

  it("binds both mutation kind and normalized input", () => {
    const parsed = {
      expectedRevision: 2,
      operationId: "00000000-0000-4000-8000-000000000001",
    };
    const base = bindPlanningMutationControl(parsed, "recommendation_select", {
      suggestionId: "suggestion_1",
    });
    const differentKind = bindPlanningMutationControl(
      parsed,
      "recommendation_deselect",
      { suggestionId: "suggestion_1" },
    );
    const differentInput = bindPlanningMutationControl(
      parsed,
      "recommendation_select",
      { suggestionId: "suggestion_2" },
    );

    expect(differentKind.requestFingerprint).not.toBe(base.requestFingerprint);
    expect(differentInput.requestFingerprint).not.toBe(base.requestFingerprint);
  });
});

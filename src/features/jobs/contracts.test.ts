import { describe, expect, it } from "vitest";

import {
  JobPayloadValidationError,
  MAX_JOB_PAYLOAD_BYTES,
  assertBoundedJson,
  boundedErrorCode,
  boundedErrorMessage,
  boundedProgressMessage,
  parseJobPayload,
} from "./contracts";

const validPayload = {
  feedbackId: "feedback_1",
  operationId: "00000000-0000-4000-8000-000000000001",
  tripVersion: 2,
  preferenceProfileVersionId: "preference_version_2",
  parentItineraryVersionId: null,
};

describe("job contracts", () => {
  it("parses a bounded, strict feedback-event payload", () => {
    expect(parseJobPayload("PROCESS_FEEDBACK_EVENT", validPayload)).toEqual(
      validPayload,
    );

    expect(() =>
      parseJobPayload("PROCESS_FEEDBACK_EVENT", {
        ...validPayload,
        unexpected: true,
      }),
    ).toThrow(JobPayloadValidationError);
  });

  it("rejects malformed identifiers and captured versions", () => {
    expect(() =>
      parseJobPayload("PROCESS_FEEDBACK_EVENT", {
        ...validPayload,
        feedbackId: "",
      }),
    ).toThrow(JobPayloadValidationError);
    expect(() =>
      parseJobPayload("PROCESS_FEEDBACK_EVENT", {
        ...validPayload,
        tripVersion: -1,
      }),
    ).toThrow(JobPayloadValidationError);
    expect(() =>
      parseJobPayload("PROCESS_FEEDBACK_EVENT", {
        ...validPayload,
        operationId: "not-a-uuid",
      }),
    ).toThrow(JobPayloadValidationError);
  });

  it("rejects oversized or non-JSON values before persistence", () => {
    expect(() =>
      assertBoundedJson(
        { text: "x".repeat(MAX_JOB_PAYLOAD_BYTES) },
        MAX_JOB_PAYLOAD_BYTES,
        "job payload",
      ),
    ).toThrow(/exceeds/);
    expect(() =>
      assertBoundedJson({ value: BigInt(1) }, MAX_JOB_PAYLOAD_BYTES),
    ).toThrow(/must be JSON/);
  });

  it("bounds progress and failure fields to database limits", () => {
    expect(boundedProgressMessage(`  ${"p".repeat(300)}  `)).toHaveLength(240);
    expect(boundedErrorMessage("e".repeat(600))).toHaveLength(500);
    expect(boundedErrorCode(" provider timeout! ")).toBe("PROVIDER_TIMEOUT_");
    expect(boundedErrorCode(undefined)).toBe("JOB_EXECUTION_FAILED");
  });
});

import { z } from "zod";

export const GENERATION_JOB_TYPES = ["PROCESS_FEEDBACK_EVENT"] as const;
export type GenerationJobType = (typeof GENERATION_JOB_TYPES)[number];

export const GENERATION_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
  "DEAD_LETTERED",
  "SUPERSEDED",
] as const;
export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];

export const JOB_ATTEMPT_STATUSES = [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "ABANDONED",
  "SUPERSEDED",
] as const;
export type JobAttemptStatus = (typeof JOB_ATTEMPT_STATUSES)[number];

export const JOB_EVENT_TYPES = [
  "RECEIVED",
  "CLAIMED",
  "UPDATING_PREFERENCES",
  "FINDING_REPLACEMENT",
  "VALIDATING_ITINERARY",
  "RETRY_SCHEDULED",
  "COMPLETED",
  "FAILED",
  "DEAD_LETTERED",
  "SUPERSEDED",
  "RECOVERED",
] as const;
export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

const boundedIdentifierSchema = z.string().trim().min(1).max(128);
const capturedVersionSchema = z.number().int().nonnegative().max(2_147_483_647);

export const processFeedbackEventPayloadSchema = z
  .object({
    feedbackId: boundedIdentifierSchema,
    operationId: z.string().trim().uuid(),
    tripVersion: capturedVersionSchema,
    preferenceProfileVersionId: boundedIdentifierSchema.nullable(),
    parentItineraryVersionId: boundedIdentifierSchema.nullable(),
  })
  .strict();

export type ProcessFeedbackEventJobPayload = z.infer<
  typeof processFeedbackEventPayloadSchema
>;

export type GenerationJobPayloadByType = {
  PROCESS_FEEDBACK_EVENT: ProcessFeedbackEventJobPayload;
};

export const MAX_JOB_PAYLOAD_BYTES = 16 * 1024;
export const MAX_JOB_RESULT_BYTES = 32 * 1024;
export const MAX_JOB_EVENT_METADATA_BYTES = 8 * 1024;
export const MAX_JOB_PROGRESS_MESSAGE_LENGTH = 240;
export const MAX_JOB_ERROR_MESSAGE_LENGTH = 500;
export const MAX_JOB_ERROR_CODE_LENGTH = 64;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export class JobPayloadValidationError extends Error {
  readonly code = "INVALID_JOB_PAYLOAD";

  constructor(message = "The job payload is invalid.") {
    super(message);
    this.name = "JobPayloadValidationError";
  }
}

function serializedByteLength(value: unknown) {
  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new JobPayloadValidationError("The job payload must be JSON.");
  }

  if (serialized === undefined) {
    throw new JobPayloadValidationError("The job payload must be JSON.");
  }

  return new TextEncoder().encode(serialized).byteLength;
}

export function assertBoundedJson(
  value: unknown,
  maxBytes: number,
  label = "value",
): asserts value is JsonValue {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer.");
  }

  const byteLength = serializedByteLength(value);

  if (byteLength > maxBytes) {
    throw new JobPayloadValidationError(
      `The ${label} exceeds the ${maxBytes}-byte limit.`,
    );
  }
}

export function parseJobPayload<TType extends GenerationJobType>(
  type: TType,
  value: unknown,
): GenerationJobPayloadByType[TType] {
  assertBoundedJson(value, MAX_JOB_PAYLOAD_BYTES, "job payload");

  switch (type) {
    case "PROCESS_FEEDBACK_EVENT": {
      const parsed = processFeedbackEventPayloadSchema.safeParse(value);

      if (!parsed.success) {
        throw new JobPayloadValidationError();
      }

      return parsed.data as GenerationJobPayloadByType[TType];
    }
  }
}

export function boundedProgressMessage(message: string | null | undefined) {
  if (message == null) return null;

  const normalized = message.trim();
  return normalized
    ? normalized.slice(0, MAX_JOB_PROGRESS_MESSAGE_LENGTH)
    : null;
}

export function boundedErrorCode(code: string | null | undefined) {
  const normalized = code
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]/g, "_");
  return normalized
    ? normalized.slice(0, MAX_JOB_ERROR_CODE_LENGTH)
    : "JOB_EXECUTION_FAILED";
}

export function boundedErrorMessage(message: string | null | undefined) {
  if (message == null) return null;

  const normalized = message.trim();
  return normalized ? normalized.slice(0, MAX_JOB_ERROR_MESSAGE_LENGTH) : null;
}

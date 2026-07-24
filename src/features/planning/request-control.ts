import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  PlanningMutationControl,
  PlanningMutationKind,
} from "./types";

const planningMutationControlSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(2_147_483_647),
  operationId: z.string().trim().uuid(),
});

export type ParsedPlanningMutationControl = z.infer<
  typeof planningMutationControlSchema
>;

export type PlanningMutationControlParseResult =
  | {
      success: true;
      data: ParsedPlanningMutationControl;
    }
  | {
      success: false;
      issues: ReturnType<z.ZodError["flatten"]>["fieldErrors"];
    };

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : canonicalize(item),
    );
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function parsePlanningMutationControl(
  body: unknown,
): PlanningMutationControlParseResult {
  const parsed = planningMutationControlSchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.flatten().fieldErrors,
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export function bindPlanningMutationControl(
  control: ParsedPlanningMutationControl,
  mutationKind: PlanningMutationKind,
  validatedInput: unknown,
): PlanningMutationControl {
  const normalizedRequest = JSON.stringify(
    canonicalize({
      kind: mutationKind,
      input: validatedInput,
    }),
  );

  return {
    ...control,
    mutationKind,
    requestFingerprint: createHash("sha256")
      .update(normalizedRequest)
      .digest("hex"),
  };
}

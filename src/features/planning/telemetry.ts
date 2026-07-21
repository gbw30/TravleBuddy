import { randomUUID } from "node:crypto";

export type PlanningOperationContext = {
  operationId: string;
  tripId: string;
};

export type PlanningOperationMetrics = {
  status?: string;
  selectedPlaceCount?: number;
  itineraryDayCount?: number;
  errorCode?: string;
};

export function createPlanningOperationContext(
  tripId: string,
  operationId?: string,
): PlanningOperationContext {
  return {
    operationId: operationId?.trim() || randomUUID(),
    tripId,
  };
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "UNKNOWN";
  }

  const candidate = error as { code?: unknown; name?: unknown };

  if (typeof candidate.code === "string") return candidate.code;
  if (typeof candidate.name === "string") return candidate.name;

  return "UNKNOWN";
}

export async function measurePlanningOperation<T>(
  operation: string,
  context: PlanningOperationContext,
  execute: () => Promise<T>,
  metrics: (result: T) => PlanningOperationMetrics = () => ({}),
) {
  const startedAt = performance.now();

  try {
    const result = await execute();
    const details = metrics(result);

    console.info(
      JSON.stringify({
        event: "planning_operation",
        operation,
        operationId: context.operationId,
        tripId: context.tripId,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        status: details.status ?? "ok",
        selectedPlaceCount: details.selectedPlaceCount ?? null,
        itineraryDayCount: details.itineraryDayCount ?? null,
        errorCode: details.errorCode ?? null,
      }),
    );

    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "planning_operation",
        operation,
        operationId: context.operationId,
        tripId: context.tripId,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        status: "error",
        selectedPlaceCount: null,
        itineraryDayCount: null,
        errorCode: errorCode(error),
      }),
    );
    throw error;
  }
}

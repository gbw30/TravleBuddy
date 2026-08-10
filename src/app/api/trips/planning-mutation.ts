import { PlanningMutationConflictError } from "@/features/planning/mutation";

export async function readPlanningMutationJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function invalidPlanningMutationControlResponse(issues: unknown) {
  return Response.json(
    {
      error: "Invalid planning mutation control.",
      issues,
    },
    { status: 422 },
  );
}

export function planningMutationConflictResponse(error: unknown) {
  if (!(error instanceof PlanningMutationConflictError)) return null;

  return Response.json(
    {
      status: error.code,
      error: error.message,
    },
    { status: 409 },
  );
}

// The shapes of the replay ledger (TB-SYS-05 to TB-SYS-07): what a change
// to a trip names so that a repeat is recognised and a stale screen refused.

export type PlanningMutationControl = {
  expectedRevision?: number;
  operationId?: string;
  mutationKind?: PlanningMutationKind;
  requestFingerprint?: string;
};

export type PlanningMutationKind =
  | "trip_rename"
  | "trip_facts_save"
  | "trip_archive"
  | "trip_restore"
  | "trip_plan_finish"
  | "trip_plan_reopen"
  | "commitment_add"
  | "commitment_update"
  | "commitment_remove"
  | "plan_pick"
  | "plan_save"
  | "plan_unshelve"
  | "plan_move"
  | "plan_remove"
  | "plan_minutes"
  | "plan_pace"
  | "plan_transfer"
  | "plan_undo"
  | "plan_others"
  | "plan_build"
  | "place_remove"
  | "conversation_turn"
  | "trip_mode_set"
  | "brief_save";

export type PlanningMutationReplay = {
  kind: string;
  requestFingerprint: string | null;
  result: unknown;
  resultingRevision: number;
};

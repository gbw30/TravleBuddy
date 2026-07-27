import type {
  GenerationJobStatus,
  GenerationJobType,
  ItineraryChangeScope,
  ItineraryVersionStatus,
} from "@/generated/prisma/client";
import type {
  ItineraryDto,
  ItineraryConflictDto,
} from "@/features/itinerary/types";
import type {
  PlanningTopic,
  RecommendationDto,
  RecommendationPreferenceSnapshot,
  SelectedPlanningPlace,
} from "@/features/recommendations/types";

export type PlanningContext = {
  topic: PlanningTopic;
  destinationId: string | null;
  planningDayNumber: number | null;
};

export type PlanningReadiness = {
  activeTopic: PlanningTopic;
  isReady: boolean;
  missingQuestionKeys: string[];
};

export type PlanningItineraryConflictDto = Omit<
  ItineraryConflictDto,
  "metadata"
>;

export type PlanningItineraryDto = Omit<ItineraryDto, "conflicts"> & {
  conflicts: PlanningItineraryConflictDto[];
};

export type PlanningJobSummary = {
  id: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  progress: number;
  progressMessage: string | null;
  attemptCount: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanningItineraryVersionSummary = {
  id: string;
  version: number;
  status: ItineraryVersionStatus;
  changeScope: ItineraryChangeScope;
  createdAt: string;
  activatedAt: string | null;
};

export type PlanningSnapshot = {
  revision: number;
  conversationId: string | null;
  context: PlanningContext;
  preference: RecommendationPreferenceSnapshot;
  readiness: PlanningReadiness;
  recommendations: RecommendationDto[];
  selectedPlaces: SelectedPlanningPlace[];
  itinerary: PlanningItineraryDto;
  activeJobs: PlanningJobSummary[];
  itineraryVersions: PlanningItineraryVersionSummary[];
};

export type PlanningTurnResult<TMessage = never, TWarning = never> = {
  revision: number;
  messages: TMessage[];
  snapshot: PlanningSnapshot;
  warnings: TWarning[];
};

export type PlanningMutationControl = {
  expectedRevision?: number;
  operationId?: string;
  mutationKind?: PlanningMutationKind;
  requestFingerprint?: string;
};

export type PlanningMutationKind =
  | "trip_settings_update"
  | "preference_save"
  | "logistics_mode_save"
  | "travel_segment_add"
  | "travel_segment_update"
  | "travel_segment_delete"
  | "planning_message_save"
  | "recommendations_generate"
  | "planning_place_add"
  | "recommendation_select"
  | "recommendation_reject"
  | "recommendation_deselect"
  | "recommendations_refresh"
  | "itinerary_item_feedback"
  | "itinerary_rebuild"
  | "conflicts_check"
  | "conflict_status_update";

export type PlanningMutationReplay = {
  kind: string;
  requestFingerprint: string | null;
  result: unknown;
  resultingRevision: number;
};

export type StalePlanningMutationResult = {
  status: "stale_revision";
  revision: number;
  snapshot: PlanningSnapshot;
};

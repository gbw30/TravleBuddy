import {
  featureIdSchema,
  featureRegistrySchema,
  featureStateSchema,
  type FeatureDefinition,
  type FeatureId,
  type FeatureState,
} from "./schemas";
import featureStatesJson from "../feature-states.json";

const registryMetadata = [
  {
    id: "authentication",
    label: "Authentication and authorization",
    documentedStage: "existing foundation",
    description: "Session protection, ownership, logout, and route policy.",
  },
  {
    id: "profile",
    label: "Travel profile",
    documentedStage: "existing foundation",
    description: "Persisted user-level travel defaults and preference profile.",
  },
  {
    id: "trip-crud",
    label: "Trip CRUD",
    documentedStage: "existing foundation",
    description: "Draft, ready, update, archive, delete, and owned trip reads.",
  },
  {
    id: "trip-preferences",
    label: "Trip preferences",
    documentedStage: "existing foundation",
    description:
      "Trip-local preference validation, inheritance, and overrides.",
  },
  {
    id: "mock-recommendations",
    label: "Mock recommendations",
    documentedStage: "existing foundation",
    description: "Deterministic scoring, generation, rerolling, and selection.",
  },
  {
    id: "planning-feedback",
    label: "Planning feedback",
    documentedStage: "existing foundation",
    description: "Selection, rejection, deselection, and feedback history.",
  },
  {
    id: "itinerary-draft",
    label: "Draft itinerary",
    documentedStage: "existing foundation",
    description: "Persisted deterministic itinerary building and cost totals.",
  },
  {
    id: "conflicts",
    label: "Conflict engine",
    documentedStage: "existing foundation",
    description: "Conflict generation, deduplication, resolution, and history.",
  },
  {
    id: "logistics",
    label: "Trip logistics",
    documentedStage: "existing foundation",
    description:
      "Flexible and ticketed segments, city windows, and travel blocks.",
  },
  {
    id: "planning-revision-contracts",
    label: "Planning revision contracts",
    documentedStage: "Stage 0",
    description:
      "Revision checks, replay-safe mutations, snapshots, and telemetry.",
  },
  {
    id: "adaptive-planning",
    label: "Versioned adaptive planning",
    documentedStage: "Adaptive planning vertical slice",
    description:
      "Immutable item feedback, source-aware preferences, deterministic replacement, and copy-on-write itinerary activation.",
  },
  {
    id: "durable-planning-jobs",
    label: "Durable planning jobs",
    documentedStage: "Adaptive planning vertical slice",
    description:
      "PostgreSQL claims, leases, heartbeats, retries, recovery, progress, and stale-result protection.",
  },
  {
    id: "conversation-persistence",
    label: "Conversation persistence",
    documentedStage: "Stage 1A",
    description: "Persisted ordered conversation and optimistic UI recovery.",
  },
  {
    id: "ai-intent",
    label: "Conversational intelligence",
    documentedStage: "Stage 1B",
    description:
      "Schema-validated intent extraction and deterministic fallback.",
  },
  {
    id: "live-scheduling",
    label: "Live itinerary scheduling",
    documentedStage: "Stage 2A",
    description: "Thirty-minute activity and meal slot assignment.",
  },
  {
    id: "google-places",
    label: "Google Places recommendations",
    documentedStage: "Stage 2B",
    description: "Validated provider-backed place recommendations.",
  },
  {
    id: "interaction-performance",
    label: "Interaction performance",
    documentedStage: "Stage 3A",
    description:
      "Measured latency, compact reads, and refresh-free interactions.",
  },
  {
    id: "cache-rate-limits",
    label: "Cache and production hardening",
    documentedStage: "Stage 3B",
    description:
      "Optional Redis, rate limits, resilience, and safe invalidation.",
  },
  {
    id: "maps",
    label: "Map presentation",
    documentedStage: "post-prototype",
    description: "Map markers, filters, provider fallback, and key isolation.",
  },
  {
    id: "export",
    label: "Trip export",
    documentedStage: "post-prototype",
    description: "Authenticated PDF and JSON export with integrity checks.",
  },
] satisfies Array<Omit<FeatureDefinition, "state">>;

const featureStates = Object.fromEntries(
  featureIdSchema.options.map((id) => [
    id,
    featureStateSchema.parse(featureStatesJson[id]),
  ]),
) as Record<FeatureId, FeatureState>;

const registryEntries = registryMetadata.map((feature) => ({
  ...feature,
  state: featureStates[feature.id],
}));

export const featureRegistry = Object.freeze(
  featureRegistrySchema.parse(registryEntries),
);

export const featureRegistryById: ReadonlyMap<FeatureId, FeatureDefinition> =
  new Map(featureRegistry.map((feature) => [feature.id, feature]));

export function isBlockingFeatureState(state: FeatureState) {
  return state === "required" || state === "candidate";
}

export interface FeatureTransitionContext {
  gateVerdict?: "PASS" | "FAIL" | "BLOCKED";
}

export function validateFeatureTransition(
  from: FeatureState,
  to: FeatureState,
  context: FeatureTransitionContext = {},
): void {
  if (from === to) {
    return;
  }

  const transition = `${from}->${to}`;
  const allowed = new Set([
    "deferred->planned",
    "planned->deferred",
    "planned->candidate",
    "candidate->planned",
  ]);

  if (transition === "candidate->required") {
    if (context.gateVerdict !== "PASS") {
      throw new Error(
        "A candidate feature can become required only after a PASS gate",
      );
    }
    return;
  }

  if (!allowed.has(transition)) {
    throw new Error(`Invalid feature state transition: ${transition}`);
  }
}

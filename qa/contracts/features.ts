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
    label: "Accounts and authorization",
    documentedStage: "Milestone 2",
    description:
      "Sign-in, session protection, ownership and route policy (TB-ACC).",
  },
  {
    id: "trip-start",
    label: "Home and starting a trip",
    documentedStage: "Milestone 3",
    description:
      "Home, a trip from tickets or from nothing, its facts and states, rename, archive and delete (TB-HOM, TB-STA, TB-FAC).",
  },
  {
    id: "fixed-commitments",
    label: "Fixed commitments",
    documentedStage: "Milestone 3",
    description:
      "Flights, stays, reservations and must-sees: kept, planned around, never moved (TB-FIX).",
  },
  {
    id: "planning-revision-contracts",
    label: "Planning revision contracts",
    documentedStage: "Milestone 4",
    description:
      "Every change to a trip names an operation and a revision: replays are recognised and stale screens refused (TB-SYS).",
  },
  {
    id: "conversation",
    label: "Guided planning conversation",
    documentedStage: "Milestone 5",
    description:
      "One question at a time, the thread, typed answers read by rules, and why a trip differs from the profile (TB-AGT).",
  },
  {
    id: "cards-itinerary",
    label: "Recommendation cards and the live itinerary",
    documentedStage: "Milestone 4",
    description:
      "Three cards for a slot with true reasons; picks, the day layout, its rules, the shelf and undo (TB-CRD, TB-ITN, TB-RSN).",
  },
  {
    id: "memory",
    label: "Memory",
    documentedStage: "Milestone 6",
    description:
      "The trip profile and the personal profile: sources, corrections, forgetting and learning (TB-MEM, TB-TRU).",
  },
  {
    id: "quick-plan",
    label: "Quick plan",
    documentedStage: "Milestone 7",
    description:
      "The brief in five steps, the build day by day, its report, and moving between the two ways of planning (TB-QPL).",
  },
  {
    id: "place-source",
    label: "Place source",
    documentedStage: "Milestone 4",
    description:
      "Place data behind one adapter: OpenStreetMap or sample places, saved once and capped per day (TB-SYS, TB-TRU).",
  },
  {
    id: "design-accessibility",
    label: "Design and accessibility",
    documentedStage: "Milestone 8",
    description:
      "The keepsake direction, keyboard, phone width, contrast, motion and text for screen readers (TB-DSN).",
  },
  {
    id: "ai-model",
    label: "AI model boundary",
    documentedStage: "Milestone 5",
    description:
      "The model reads typed input only, behind a schema and a cost cap; everything works with it off. No request has been made with a real key.",
  },
  {
    id: "interaction-performance",
    label: "Interaction performance",
    documentedStage: "Milestone 8",
    description:
      "Measured latency of planning interactions. No budget has been measured yet.",
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

import type {
  AdaptationFeedback,
  AdaptivePreferenceSnapshot,
  CategoricalPreferenceSignal,
  PreferenceSource,
  WeightedPreferenceSignal,
} from "./schemas";

const SOURCE_PRECEDENCE: Readonly<Record<PreferenceSource, number>> = {
  DEFAULT: 0,
  INFERRED: 1,
  EXPLICIT: 2,
};

export const TOO_EXPENSIVE_SIGNAL_INCREMENT = 0.1;

type SourceAwareSignal = {
  source: PreferenceSource;
  confidence: number;
  observedAt: string;
};

export type PreferenceMergeResult<TSignal extends SourceAwareSignal> = {
  signal: TSignal;
  selected: "CURRENT" | "INCOMING";
  reason:
    | "ONLY_SIGNAL"
    | "HIGHER_SOURCE_PRECEDENCE"
    | "NEWER_OBSERVATION"
    | "HIGHER_CONFIDENCE"
    | "EQUIVALENT_SIGNAL";
};

export type PreferencePolicyDelta = {
  field: "priceSensitivity";
  before: WeightedPreferenceSignal;
  after: WeightedPreferenceSignal;
  weightChange: number;
  confidenceChange: number;
};

export type PreferencePolicyResult =
  | {
      status: "UPDATED";
      snapshot: AdaptivePreferenceSnapshot;
      delta: PreferencePolicyDelta;
      explanation: string;
    }
  | {
      status: "NO_CHANGE";
      snapshot: AdaptivePreferenceSnapshot;
      delta: null;
      reason:
        | "EXPLICIT_PREFERENCE_PROTECTED"
        | "SIGNAL_AT_MAXIMUM"
        | "UNSUPPORTED_FEEDBACK";
      explanation: string;
    };

function boundedIncrement(value: number, increment: number) {
  const incremented = Math.round((value + increment) * 1_000_000) / 1_000_000;

  return Math.min(1, Math.max(0, incremented));
}

function timestamp(value: string) {
  return Date.parse(value);
}

/**
 * Resolves two signals without mutating either one.
 *
 * Explicit values always win over inferred values, which always win over
 * defaults. Recency and confidence are only tie-breakers between signals from
 * the same source, preventing a recent inference from silently replacing an
 * explicit answer.
 */
export function resolvePreferenceSignal<TSignal extends SourceAwareSignal>(
  current: TSignal | null | undefined,
  incoming: TSignal,
): PreferenceMergeResult<TSignal> {
  if (!current) {
    return {
      signal: incoming,
      selected: "INCOMING",
      reason: "ONLY_SIGNAL",
    };
  }

  const sourceDifference =
    SOURCE_PRECEDENCE[incoming.source] - SOURCE_PRECEDENCE[current.source];

  if (sourceDifference !== 0) {
    const useIncoming = sourceDifference > 0;

    return {
      signal: useIncoming ? incoming : current,
      selected: useIncoming ? "INCOMING" : "CURRENT",
      reason: "HIGHER_SOURCE_PRECEDENCE",
    };
  }

  const observedAtDifference =
    timestamp(incoming.observedAt) - timestamp(current.observedAt);

  if (observedAtDifference !== 0) {
    const useIncoming = observedAtDifference > 0;

    return {
      signal: useIncoming ? incoming : current,
      selected: useIncoming ? "INCOMING" : "CURRENT",
      reason: "NEWER_OBSERVATION",
    };
  }

  if (incoming.confidence !== current.confidence) {
    const useIncoming = incoming.confidence > current.confidence;

    return {
      signal: useIncoming ? incoming : current,
      selected: useIncoming ? "INCOMING" : "CURRENT",
      reason: "HIGHER_CONFIDENCE",
    };
  }

  return {
    signal: current,
    selected: "CURRENT",
    reason: "EQUIVALENT_SIGNAL",
  };
}

function mergeInterestSignals(
  current: AdaptivePreferenceSnapshot["interests"],
  incoming: Partial<AdaptivePreferenceSnapshot["interests"]>,
) {
  const merged = { ...current };

  for (const [interest, signal] of Object.entries(incoming)) {
    if (!signal) {
      continue;
    }

    merged[interest] = resolvePreferenceSignal(
      current[interest],
      signal,
    ).signal;
  }

  return merged;
}

export type PreferenceSnapshotUpdate = {
  interests?: Partial<AdaptivePreferenceSnapshot["interests"]>;
  priceSensitivity?: WeightedPreferenceSignal;
  pace?: CategoricalPreferenceSignal | null;
};

/**
 * Field-wise merge for a persisted preference snapshot. A null pace is an
 * explicit absence of an update; removing a pace requires a new explicit
 * product policy rather than silently erasing the existing value.
 */
export function mergePreferenceSnapshots(
  current: AdaptivePreferenceSnapshot,
  update: PreferenceSnapshotUpdate,
): AdaptivePreferenceSnapshot {
  return {
    ...current,
    interests: update.interests
      ? mergeInterestSignals(current.interests, update.interests)
      : current.interests,
    priceSensitivity: update.priceSensitivity
      ? resolvePreferenceSignal(
          current.priceSensitivity,
          update.priceSensitivity,
        ).signal
      : current.priceSensitivity,
    pace:
      update.pace && current.pace
        ? resolvePreferenceSignal(current.pace, update.pace).signal
        : (update.pace ?? current.pace),
  };
}

function applyTooExpensivePolicy(
  snapshot: AdaptivePreferenceSnapshot,
  observedAt: string,
): PreferencePolicyResult {
  const current = snapshot.priceSensitivity;

  if (current.source === "EXPLICIT") {
    return {
      status: "NO_CHANGE",
      snapshot,
      delta: null,
      reason: "EXPLICIT_PREFERENCE_PROTECTED",
      explanation:
        "The explicit price-sensitivity setting was preserved; the rejected place remains excluded.",
    };
  }

  const after: WeightedPreferenceSignal = {
    weight: boundedIncrement(current.weight, TOO_EXPENSIVE_SIGNAL_INCREMENT),
    confidence: boundedIncrement(
      current.confidence,
      TOO_EXPENSIVE_SIGNAL_INCREMENT,
    ),
    source: "INFERRED",
    observedAt,
  };

  if (
    after.weight === current.weight &&
    after.confidence === current.confidence &&
    current.source === "INFERRED"
  ) {
    return {
      status: "NO_CHANGE",
      snapshot,
      delta: null,
      reason: "SIGNAL_AT_MAXIMUM",
      explanation:
        "Price sensitivity was already at maximum weight and confidence.",
    };
  }

  const nextSnapshot = {
    ...snapshot,
    priceSensitivity: after,
  };

  return {
    status: "UPDATED",
    snapshot: nextSnapshot,
    delta: {
      field: "priceSensitivity",
      before: current,
      after,
      weightChange: after.weight - current.weight,
      confidenceChange: after.confidence - current.confidence,
    },
    explanation:
      "Price sensitivity increased after an activity was marked too expensive.",
  };
}

/**
 * Applies only explicitly supported inferred-preference policies. Unsupported
 * feedback is deliberately a no-op so a reason cannot cause an accidental
 * broad preference rewrite.
 */
export function applyFeedbackPreferencePolicy(
  snapshot: AdaptivePreferenceSnapshot,
  feedback: Pick<AdaptationFeedback, "reason" | "observedAt">,
): PreferencePolicyResult {
  if (feedback.reason === "TOO_EXPENSIVE") {
    return applyTooExpensivePolicy(snapshot, feedback.observedAt);
  }

  return {
    status: "NO_CHANGE",
    snapshot,
    delta: null,
    reason: "UNSUPPORTED_FEEDBACK",
    explanation:
      "The feedback was preserved, but it has no inferred-preference policy yet.",
  };
}

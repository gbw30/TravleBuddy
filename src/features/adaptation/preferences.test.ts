import { describe, expect, it } from "vitest";
import type {
  AdaptivePreferenceSnapshot,
  CategoricalPreferenceSignal,
  WeightedPreferenceSignal,
} from "./schemas";
import {
  applyFeedbackPreferencePolicy,
  mergePreferenceSnapshots,
  resolvePreferenceSignal,
} from "./preferences";

const earlier = "2026-07-25T12:00:00.000Z";
const later = "2026-07-26T12:00:00.000Z";

function weighted(
  source: WeightedPreferenceSignal["source"],
  overrides: Partial<WeightedPreferenceSignal> = {},
): WeightedPreferenceSignal {
  return {
    weight: 0.5,
    confidence: 0.5,
    source,
    observedAt: earlier,
    ...overrides,
  };
}

function snapshot(
  priceSensitivity: WeightedPreferenceSignal = weighted("DEFAULT"),
): AdaptivePreferenceSnapshot {
  return {
    schemaVersion: 1,
    interests: {
      FOOD: weighted("EXPLICIT", {
        weight: 0.8,
        confidence: 0.9,
      }),
      HISTORY: weighted("DEFAULT", {
        weight: 0.3,
        confidence: 0.2,
      }),
    },
    priceSensitivity,
    pace: {
      value: "BALANCED",
      confidence: 0.5,
      source: "DEFAULT",
      observedAt: earlier,
    },
  };
}

describe("preference source precedence", () => {
  it("protects an explicit signal from a newer, more confident inference", () => {
    const explicit = weighted("EXPLICIT", {
      weight: 0.2,
      confidence: 0.3,
      observedAt: earlier,
    });
    const inferred = weighted("INFERRED", {
      weight: 0.95,
      confidence: 1,
      observedAt: later,
    });

    expect(resolvePreferenceSignal(explicit, inferred)).toEqual({
      signal: explicit,
      selected: "CURRENT",
      reason: "HIGHER_SOURCE_PRECEDENCE",
    });
  });

  it("replaces an inference with an older explicit answer", () => {
    const inferred = weighted("INFERRED", { observedAt: later });
    const explicit = weighted("EXPLICIT", { observedAt: earlier });

    expect(resolvePreferenceSignal(inferred, explicit)).toMatchObject({
      signal: explicit,
      selected: "INCOMING",
      reason: "HIGHER_SOURCE_PRECEDENCE",
    });
  });

  it("uses recency then confidence only for equal sources", () => {
    const current = weighted("INFERRED", {
      confidence: 0.9,
      observedAt: earlier,
    });
    const recent = weighted("INFERRED", {
      confidence: 0.2,
      observedAt: later,
    });
    const equallyRecent = weighted("INFERRED", {
      confidence: 1,
      observedAt: later,
    });

    expect(resolvePreferenceSignal(current, recent)).toMatchObject({
      signal: recent,
      reason: "NEWER_OBSERVATION",
    });
    expect(resolvePreferenceSignal(recent, equallyRecent)).toMatchObject({
      signal: equallyRecent,
      reason: "HIGHER_CONFIDENCE",
    });
  });

  it("preserves the existing signal for an equivalent replay", () => {
    const current = weighted("INFERRED");

    expect(resolvePreferenceSignal(current, { ...current })).toEqual({
      signal: current,
      selected: "CURRENT",
      reason: "EQUIVALENT_SIGNAL",
    });
  });

  it("merges interests independently and preserves explicit values", () => {
    const current = snapshot();
    const inferredFood = weighted("INFERRED", {
      weight: 0,
      observedAt: later,
    });
    const inferredNature = weighted("INFERRED", {
      weight: 0.7,
      observedAt: later,
    });
    const next = mergePreferenceSnapshots(current, {
      interests: {
        FOOD: inferredFood,
        NATURE: inferredNature,
      },
    });

    expect(next.interests.FOOD).toBe(current.interests.FOOD);
    expect(next.interests.HISTORY).toBe(current.interests.HISTORY);
    expect(next.interests.NATURE).toBe(inferredNature);
  });

  it("applies precedence to categorical pace signals", () => {
    const current = snapshot();
    const inferred: CategoricalPreferenceSignal = {
      value: "PACKED",
      confidence: 1,
      source: "INFERRED",
      observedAt: later,
    };
    const explicit: CategoricalPreferenceSignal = {
      value: "RELAXED",
      confidence: 0.4,
      source: "EXPLICIT",
      observedAt: earlier,
    };
    const withInference = mergePreferenceSnapshots(current, {
      pace: inferred,
    });
    const withExplicit = mergePreferenceSnapshots(withInference, {
      pace: explicit,
    });

    expect(withInference.pace).toBe(inferred);
    expect(withExplicit.pace).toBe(explicit);
  });
});

describe("feedback preference policy", () => {
  it("increases inferred price-sensitivity weight and confidence by 0.10", () => {
    const current = snapshot(
      weighted("INFERRED", { weight: 0.65, confidence: 0.5 }),
    );
    const result = applyFeedbackPreferencePolicy(current, {
      reason: "TOO_EXPENSIVE",
      observedAt: later,
    });

    expect(result.status).toBe("UPDATED");

    if (result.status !== "UPDATED") {
      throw new Error("Expected the policy to update the preference.");
    }

    expect(result.snapshot).not.toBe(current);
    expect(result.snapshot.interests).toBe(current.interests);
    expect(result.snapshot.priceSensitivity).toEqual({
      weight: 0.75,
      confidence: 0.6,
      source: "INFERRED",
      observedAt: later,
    });
    expect(result.delta.weightChange).toBeCloseTo(0.1);
    expect(result.delta.confidenceChange).toBeCloseTo(0.1);
    expect(current.priceSensitivity.weight).toBe(0.65);
  });

  it("turns a default into an inference without changing interests", () => {
    const current = snapshot(
      weighted("DEFAULT", { weight: 0.3, confidence: 0.2 }),
    );
    const result = applyFeedbackPreferencePolicy(current, {
      reason: "TOO_EXPENSIVE",
      observedAt: later,
    });

    expect(result.status).toBe("UPDATED");
    expect(result.snapshot.priceSensitivity).toMatchObject({
      weight: 0.4,
      confidence: 0.3,
      source: "INFERRED",
    });
    expect(result.snapshot.interests).toBe(current.interests);
  });

  it("caps both inferred values at one", () => {
    const current = snapshot(
      weighted("INFERRED", { weight: 0.96, confidence: 0.95 }),
    );
    const result = applyFeedbackPreferencePolicy(current, {
      reason: "TOO_EXPENSIVE",
      observedAt: later,
    });

    expect(result.snapshot.priceSensitivity).toMatchObject({
      weight: 1,
      confidence: 1,
    });
  });

  it("protects an explicit price-sensitivity signal", () => {
    const current = snapshot(
      weighted("EXPLICIT", { weight: 0.2, confidence: 0.4 }),
    );
    const result = applyFeedbackPreferencePolicy(current, {
      reason: "TOO_EXPENSIVE",
      observedAt: later,
    });

    expect(result).toMatchObject({
      status: "NO_CHANGE",
      snapshot: current,
      delta: null,
      reason: "EXPLICIT_PREFERENCE_PROTECTED",
    });
  });

  it("returns a semantic no-op at maximum inferred strength", () => {
    const current = snapshot(
      weighted("INFERRED", { weight: 1, confidence: 1 }),
    );

    expect(
      applyFeedbackPreferencePolicy(current, {
        reason: "TOO_EXPENSIVE",
        observedAt: later,
      }),
    ).toMatchObject({
      status: "NO_CHANGE",
      snapshot: current,
      reason: "SIGNAL_AT_MAXIMUM",
    });
  });

  it.each([
    null,
    "NOT_INTERESTED",
    "TOO_FAR",
    "WRONG_VIBE",
    "ALREADY_BEEN_THERE",
    "TOO_BUSY",
    "TOO_SLOW",
    "GOOD_MATCH",
    "OTHER",
  ] as const)("does not infer a policy for %s", (reason) => {
    const current = snapshot();

    expect(
      applyFeedbackPreferencePolicy(current, {
        reason,
        observedAt: later,
      }),
    ).toMatchObject({
      status: "NO_CHANGE",
      snapshot: current,
      reason: "UNSUPPORTED_FEEDBACK",
    });
  });
});

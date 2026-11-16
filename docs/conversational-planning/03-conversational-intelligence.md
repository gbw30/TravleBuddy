# Stage 1B - Conversational Intelligence

Status: stage-plan
Authority: Validated intent, question policy, and conversational recommendation intent
Related: [Canonical target](../requirements.md), [current implementation](../status/current-implementation.md), [active roadmap](../roadmap.md), [preceding stage](02-conversation-persistence-ui.md)
Last reviewed: 2026-08-09

## Goal

Add validated natural-language intent extraction and a deterministic question policy. At completion, a user can build a preference profile, receive mock recommendations automatically, select or reroll them in conversation, and see the itinerary update.

## Architecture Decisions

### Fully agentic, deterministic, or hybrid

Options:

- Fully agentic tool loop: flexible but difficult to predict, test, and limit.
- Deterministic questionnaire: reliable but fails the natural-language product goal.
- Hybrid controller: AI parses bounded intent; backend policy chooses and executes actions. Recommended.

### One model call or separate extraction and response calls

Options:

- Two calls on every turn: best natural prose, highest latency and cost.
- One unrestricted agent call: fewer explicit calls but may perform multiple model steps.
- Structured extraction plus deterministic responses; AI explanation only when useful. Recommended.

Routine preference acknowledgments and next questions should be templated. Use streamed AI prose for recommendation explanations, itinerary summaries, and direct user questions that require synthesis.

## Public Intent Contract

```ts
type PlanningIntentAction =
  | "ANSWER_PREFERENCE"
  | "CHANGE_PREFERENCE"
  | "CHANGE_CONTEXT"
  | "REQUEST_RECOMMENDATIONS"
  | "REROLL_RECOMMENDATIONS"
  | "SELECT_RECOMMENDATION"
  | "REJECT_RECOMMENDATION"
  | "DESELECT_PLACE"
  | "ADD_KNOWN_PLACE"
  | "CHANGE_SCHEDULE_LIMIT"
  | "BUILD_ITINERARY"
  | "ASK_FOR_EXPLANATION"
  | "UNKNOWN";

type PlanningTurnIntent = {
  intents: PlanningIntentAction[];
  preferencePatch?: PreferencePatch;
  schedulePatch?: SchedulePolicyPatch;
  recommendationReference?: { index?: number; name?: string };
  note?: string;
  confidence: number;
};
```

Rules:

- maximum three intents per turn
- schema validation required
- numerical values use server-enforced ranges
- model-provided IDs are never trusted
- low-confidence or ambiguous references trigger clarification

## Step-by-Step Implementation

### Step 1: Configure the model boundary

Purpose: keep provider setup lazy and replaceable.

1. Add AI SDK and the selected Gateway integration.
2. Implement lazy `getPlanningModel()`.
3. Add validated `AI_MODEL` configuration.
4. Use Vercel OIDC locally through `vercel env pull` and automatically in deployment.
5. Keep deterministic extraction active when model configuration is absent or the call fails.

### Step 2: Implement structured intent extraction

Purpose: translate natural language into bounded application commands.

1. Build a Zod schema for `PlanningTurnIntent`.
2. Provide the model only the compact preference snapshot, active context, latest recommendation batch, and allowed actions.
3. Do not send raw provider payloads or unbounded history.
4. Validate output before any mutation.
5. Normalize names and ordinal references such as “the second one.”
6. Resolve references against the latest visible batch on the server.
7. Fall back to deterministic extraction for preference-only messages.

### Step 3: Build the question engine

Purpose: make product questioning deterministic and testable.

Readiness groups:

- hotel/base: accommodation type plus walking/location preference
- activities: one or more interests plus pace
- food/nightlife: food/nightlife intent plus dietary or meal preference
- budget/pace: budget level plus pace or transportation
- scheduling: daily bounds, duration overrides, or item-count limits only when relevant

Policy:

1. Ask one question at a time.
2. Prioritize the active topic.
3. Do not immediately repeat skipped questions.
4. Permit corrections at any time.
5. Treat the explicit trip budget as different from comfort level.
6. Generate exactly three visible recommendations automatically when the active topic becomes ready.
7. Let the user switch topics naturally or through visible controls.

### Step 4: Add the planning action dispatcher

Purpose: ensure AI interpretation cannot bypass service validation.

Map intents to existing services. Apply preference/context changes first, recommendation actions second, and itinerary rebuild last. Perform at most one rebuild and conflict refresh per turn.

For multi-intent messages:

- execute only non-conflicting actions
- ask clarification if two actions target different ambiguous recommendations
- roll back the turn if an atomic required mutation fails
- preserve the user message and return a recoverable assistant explanation

### Step 5: Embed recommendation interactions in messages

Purpose: complete the conversation loop without separate recommendation forms.

Recommendation messages show exactly three cards with:

- name, category, city, rating, estimated cost
- concise deterministic match explanation
- select and reject commands
- reroll control with optional natural-language note

Selection, rejection, removal, and reroll update the conversation and live itinerary without navigation. Rejected records and feedback history remain persisted.

This stage mutates explicit current-trip preferences only. Reusable defaults may seed a trip, but no interaction is described as learned long-term user behavior until the later preference-learning milestone defines provenance, confidence, correction, and reset rules.

### Step 6: Add AI usage persistence and safeguards

- Store model, input/output token counts, duration, finish reason, and error code.
- Do not store hidden reasoning.
- Mark the assistant message `ERROR` on an interrupted generation.
- Allow retry with the same user message ID.
- Cap model/tool steps at five.
- Use a bounded conversation summary plus recent messages instead of sending full history indefinitely.

## Test Requirements

- Every supported intent validates and dispatches correctly.
- Invalid or excessive intents perform no mutation.
- “Select the second one” resolves only against the latest batch.
- Ambiguous place names produce a clarification question.
- Corrections replace current canonical values and preserve feedback history.
- Topic readiness automatically generates recommendations once.
- Rerolls incorporate the note and exclude rejected/current results where alternatives exist.
- AI failure uses deterministic fallback.
- One turn performs at most one itinerary rebuild.
- Token and error metadata are persisted.

## Developer Actions

- Enable Vercel AI Gateway for the project.
- Configure `AI_MODEL` in local, preview, and production environments.
- Run `vercel env pull` for local OIDC credentials.
- Define acceptable per-user model usage for Stage 3B rate limits.

## Exit Criteria

- The mock-data preference-to-itinerary flow can be completed primarily through chat.
- Model output cannot directly write database state.
- The app remains usable without AI.
- Recommendations auto-appear when topic readiness is reached.
- Full verification and conversational QA pass.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 1B from docs/conversational-planning/03-conversational-intelligence.md. Stage 1A persistence and deterministic chat must already pass. Add the hybrid AI intent extractor, deterministic question engine, bounded dispatcher, and in-message mock recommendation interactions. Keep backend services authoritative, enforce idempotency/revisions, and preserve the no-AI fallback.
```

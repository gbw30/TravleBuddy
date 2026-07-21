# Stage 1A - Conversation Persistence and UI Shell

Status: not started  
Depends on: Stage 0  
Estimated effort: 2-3 working days

## Goal

Create a persisted, deterministic conversation experience with a live itinerary panel. This stage proves routing, storage, optimistic interaction, and component boundaries before model behavior is introduced.

## Architecture Decisions

### Reuse planning audit tables or add chat tables

Options:

- Reuse `PlanningFeedback` and `PlanningEvent`: fewer tables, but cannot cleanly represent stream state, rich message parts, retries, or token usage.
- Store all messages in one trip JSON value: minimal schema, but append and recovery become expensive and fragile.
- Add conversation and message records: one migration and clear lifecycle. Recommended.

`PlanningFeedback` and `PlanningEvent` remain the domain audit trail. Chat messages represent what appeared in the conversational UI.

### Chat route shape

Options:

- Server Actions per message: good for forms, but not ideal for a rich streaming protocol.
- One trip-scoped streaming route: simple ownership and stable client transport. Recommended.
- Separate route for every conversational tool: creates network waterfalls and duplicates service authorization.

Use `POST /api/trips/[tripId]/chat`. The route calls the turn service directly.

## Data Model

Add:

```text
PlanningConversation
- id: cuid primary key
- tripId: unique relation to Trip for the active prototype conversation
- status: ACTIVE | ARCHIVED
- state: JSON nullable
- createdAt
- updatedAt

PlanningMessage
- id: stable client/server message ID
- conversationId
- sequence: increasing integer
- role: USER | ASSISTANT | SYSTEM
- parts: JSON
- metadata: JSON nullable
- status: PENDING | COMPLETE | ERROR
- model: nullable string
- inputTokens: nullable integer
- outputTokens: nullable integer
- errorCode: nullable string
- createdAt
- updatedAt
```

Constraints:

- unique conversation per trip for the prototype
- unique `(conversationId, sequence)`
- unique message ID
- index messages by conversation and sequence
- cascade messages when their conversation is deleted
- archive rather than delete normal conversation history

`Trip.planningRevision` remains the canonical revision for conversation, preference, recommendation, itinerary, logistics, and conflict state. Do not add a conversation-owned revision. Use the Stage 0 `PlanningMutation` ledger for operation replay and idempotency.

## Step-by-Step Implementation

### Step 1: Add and migrate conversation persistence

Purpose: make chat state durable before building client behavior.

1. Add Prisma enums and models.
2. Create an explicit migration with indexes and constraints.
3. Add repository functions to create/load the active trip conversation, list bounded messages, append a message, and update message status.
4. Authorize through trip ownership before reading a conversation.
5. Load the newest 30 messages initially; support an older-message cursor later.

### Step 2: Define UI message validation

Purpose: prevent invalid stored parts or stale tool shapes from reaching the model or renderer.

1. Define `PlanningUIMessage` and allowed metadata/data-part schemas.
2. Validate every inbound message.
3. Validate persisted messages when loading them.
4. Reject unsupported message roles and unknown persistent data parts.
5. Keep transient notifications out of persisted history.

### Step 3: Build a deterministic turn service

Purpose: prove end-to-end conversation behavior without AI availability.

For this stage, the service should:

1. Authenticate and check ownership.
2. Check the client `expectedRevision` and stable operation ID against `Trip.planningRevision` and the Stage 0 mutation ledger.
3. Persist the user message.
4. Pass its text through the existing deterministic preference extractor.
5. Save extracted preference signals through existing services.
6. Select the next deterministic question from a small ordered set.
7. Rebuild the itinerary once if a preference such as pace affects it.
8. Persist a templated assistant response.
9. Finalize the composed turn once so nested preference, recommendation, itinerary, and conflict work produces one revision increment.
10. Return `PlanningTurnResult<PlanningUIMessage, PlanningWarning>` with the updated snapshot.

Use the stable message ID as the turn `operationId`; the same operation ID must return the original bounded result without duplicating domain writes.

### Step 4: Add the chat route

Purpose: provide one stable transport for the future model stream.

Request:

```ts
{
  conversationId: string;
  expectedRevision: number;
  operationId: string;
  message: PlanningUIMessage;
}
```

Expected failures:

- `400` malformed JSON
- `401` unauthenticated
- `404` trip/conversation not found for owner
- `409` stale revision or archived trip
- `422` invalid message
- `429` rate limit, added in Stage 3B
- `500` recoverable internal failure

Keep the route thin and avoid `revalidatePath`.

### Step 5: Build replaceable UI boundaries

Purpose: let visual design change without changing persistence or behavior.

Create:

- `PlanningExperience`: client state and transport container
- `ConversationFeed`: ordered message list
- `PlanningMessage`: message-part renderer
- `ChatComposer`: text input, submit, stop, retry state
- `QuestionPrompt`: assistant question and suggested answers
- `AnswerChips`: accessible predefined answers
- `LiveItineraryPanel`: read-only compact itinerary
- `PlanningDetailsPanel`: collapsed legacy/manual controls

Desktop uses conversation as the main column and itinerary as the stable side column. Mobile uses a segmented Conversation/Itinerary view while preserving component state.

### Step 6: Add optimistic and recovery behavior

Purpose: remove perceived delay without compromising persistence.

- Display the user message immediately with pending status.
- Prevent duplicate submit for the same message.
- Replace pending state with persisted server state when the turn completes.
- Show retry for failed assistant turns.
- Preserve typed-but-unsent composer text across panel switches.
- Keep the existing structured forms in `Edit details` as a fallback.

## Test Requirements

- Conversation is created once per trip.
- Messages retain deterministic order.
- Messages survive page reload.
- Duplicate message IDs do not duplicate preference updates.
- Stale `expectedRevision` returns the latest snapshot without committed writes.
- Unauthorized users cannot infer whether another trip has a conversation.
- Optimistic messages reconcile with server IDs/status.
- Mobile panel switching preserves the composer and message state.
- Existing structured fallback actions still work.

## Developer Actions

- Apply the new migration to development and QA.
- QA two tabs editing the same trip.
- Verify refresh/back navigation restores the same conversation.

## Exit Criteria

- Deterministic chat works with no AI configuration.
- Conversation history survives reloads.
- Preference updates and itinerary changes appear without page navigation.
- Legacy controls remain available in a collapsed fallback.
- Full verification passes.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 1A from docs/conversational-planning/02-conversation-persistence-ui.md after confirming Stage 0 is complete. Build durable conversation/message storage, the deterministic turn route, and the replaceable chat plus live-itinerary UI. Do not add Gemini or Google Places yet. Preserve legacy controls as a collapsed fallback and avoid broad route refreshes.
```

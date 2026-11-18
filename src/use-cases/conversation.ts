import {
  addUsage,
  aiMode,
  appendMessages,
  decide,
  intentOfTap,
  labelsOf,
  lastQuestionTopic,
  modelCall,
  nextQuestion,
  readAnswerByRule,
  readConversation,
  readiness,
  readinessNote,
  readSkippedFacts,
  readTypedInput,
  readUsage,
  skipFact,
  stateAfter,
  underCap,
  usageMonth,
  type Decision,
  type ModelCall,
  type NewMessage,
  type ScriptState,
} from "@/features/conversation";
import type {
  ConversationSnapshot,
  Intent,
  Question,
  Turn,
  TurnResult,
} from "@/features/conversation/contracts";
import { PACES } from "@/features/itinerary/contracts";
import { readProfile, readTripTaste, saveTripAnswer } from "@/features/memory";
import { findCities } from "@/features/places";
import type { City } from "@/features/places/contracts";
import {
  addCommitment,
  findEditable,
  getTrip,
  saveTripFacts,
  todayIn,
} from "@/features/trips";
import type { TripDetail } from "@/features/trips/contracts";
import { db } from "@/lib/db";

import { planDays, setPlanPace } from "./plan";
import { Refusal, runTripAction, type TripActionOutcome } from "./trip-action";

// The guided conversation spans five services: Conversation holds the script,
// the thread and the AI model boundary; Trips the facts and commitments;
// Memory the trip's taste; Places the city lookup; Itinerary the days. The
// model only reads: every change here goes through the same service functions
// the forms use (TB-AGT-14, TB-TRU-03).

async function scriptState(
  trip: TripDetail,
  userId: string,
): Promise<ScriptState> {
  const [taste, skippedFacts, personal] = await Promise.all([
    readTripTaste(db, trip.id),
    readSkippedFacts(db, trip.id),
    readProfile(db, userId),
  ]);
  return {
    // What is remembered from before this trip: the agent confirms it
    // instead of asking again (TB-AGT-06).
    remembered: personal.entries,
    facts: trip.facts,
    commitments: {
      count: trip.commitments.length,
      hasStay: trip.commitments.some((item) => item.kind === "STAY"),
    },
    profile: { taste, skippedFacts },
  };
}

/** The way to call the model, or null when it is off or this month's cap is reached (TB-SYS-11). */
async function openModel(now: Date): Promise<ModelCall | null> {
  const call = modelCall();
  if (!call) return null;
  return underCap(await readUsage(db, usageMonth(now))) ? call : null;
}

/**
 * What a typed message means. The model reads it when it can; otherwise, and
 * whenever its reply cannot be used, the simple rules do (TB-AGT-15).
 */
async function readSaid(
  text: string,
  waiting: Question | null,
  trip: TripDetail,
): Promise<{ intent: Intent; limited: boolean }> {
  const byRule = (): Intent =>
    waiting ? readAnswerByRule(waiting, text) : { type: "none" };
  const now = new Date();
  const call = await openModel(now);
  if (!call) return { intent: byRule(), limited: true };

  const reading = await readTypedInput(
    {
      text,
      question: waiting,
      today: todayIn(trip.facts.cities[0]?.city.timeZone ?? null, now),
      startDate: trip.facts.startDate,
      endDate: trip.facts.endDate,
    },
    call,
  );
  if (reading.status === "failed") return { intent: byRule(), limited: true };
  // Counted outside the turn's transaction: the call is paid for whatever
  // happens to the turn.
  await addUsage(db, usageMonth(now), reading.usage);
  return {
    intent: reading.status === "read" ? reading.intent : byRule(),
    limited: false,
  };
}

/** Each named city, looked up in order: the best match, or null when there is none. */
async function lookUp(
  names: string[],
): Promise<(City | null)[] | "unavailable"> {
  const found: (City | null)[] = [];
  for (const name of names) {
    const outcome = await findCities(name);
    if (outcome.status !== "ok") return "unavailable";
    found.push(outcome.cities[0] ?? null);
  }
  return found;
}

/** The conversation as it stands, or null when the trip is not the traveller's. */
export async function loadConversation(
  userId: string,
  tripId: string,
): Promise<ConversationSnapshot | null> {
  const trip = await getTrip(userId, tripId);
  if (!trip) return null;
  const [messages, state, call] = await Promise.all([
    readConversation(db, tripId),
    scriptState(trip, userId),
    openModel(new Date()),
  ]);
  return {
    messages,
    waiting: trip.archived ? null : nextQuestion(state),
    needs: readiness(state).needs,
    limited: call === null,
  };
}

/** What the traveller said and what it leads to, or why the turn cannot be taken. */
async function prepare(
  turn: Turn,
  waiting: Question | null,
  trip: TripDetail,
  userId: string,
): Promise<{ said: string; decision: Decision } | Refusal> {
  if (turn.type === "say") {
    const { intent, limited } = await readSaid(turn.text, waiting, trip);
    // Cities are looked up only when they could be saved: a trip keeps the
    // cities it has.
    const named =
      intent.type === "facts" && trip.facts.cities.length === 0
        ? (intent.cities ?? [])
        : [];
    return {
      said: turn.text,
      decision: decide({
        intent,
        waiting,
        trip,
        cities: named.length > 0 ? await lookUp(named) : [],
        days: intent.type === "go_to" ? await planDays(userId, trip) : [],
        limited,
      }),
    };
  }

  if (waiting?.topic !== turn.topic) {
    return new Refusal(
      "That question is no longer waiting. Reload the page to see where we are.",
    );
  }
  if (
    turn.type === "answer" &&
    turn.topic === "decided" &&
    turn.values[0] === "something"
  ) {
    return {
      said: labelsOf(waiting, ["something"])[0],
      decision: {
        change: { type: "skip_fact", topic: "decided" },
        says:
          aiMode() === "on"
            ? "Add it under Already decided, or tell me here what it is, with its day and time."
            : "Add it under Already decided.",
      },
    };
  }
  const intent: Intent =
    turn.type === "skip" ? { type: "skip" } : intentOfTap(waiting, turn.values);
  if (intent.type === "none") {
    return new Refusal("That is not one of the choices.");
  }
  return {
    said:
      turn.type === "skip"
        ? "Skip"
        : labelsOf(
            waiting,
            intent.type === "taste" ? intent.values : turn.values.slice(0, 1),
          ).join(", "),
    decision: decide({
      intent,
      waiting,
      trip,
      cities: [],
      days: [],
      limited: false,
    }),
  };
}

/**
 * One turn of the conversation, through the replay ledger: a tapped answer, a
 * skip or a typed message. It makes at most one change and saves what was
 * said, in order, in the same transaction (TB-AGT-13).
 */
export async function takeTurn(input: {
  userId: string;
  tripId: string;
  control: { operationId: string; expectedRevision: number };
  turn: Turn;
}): Promise<TripActionOutcome<TurnResult>> {
  const { userId, tripId, turn } = input;
  const trip = await getTrip(userId, tripId);
  if (!trip) return { status: "not_found" };
  const state = await scriptState(trip, userId);
  const waiting = nextQuestion(state);
  // Worked out before the ledger is asked, because reading a message can call
  // the model. A refusal still goes to the ledger: a repeat of a turn that
  // went through must get its first answer, not "no longer waiting".
  const prepared = trip.archived
    ? null
    : await prepare(turn, waiting, trip, userId);

  return runTripAction<TurnResult>({
    userId,
    tripId,
    kind: "conversation_turn",
    control: input.control,
    request: turn,
    apply: async (tx) => {
      const refused = await findEditable(tx, userId, tripId);
      if (refused) return refused;
      if (!prepared) return "archived";
      if (prepared instanceof Refusal) return prepared;

      const { said, decision } = prepared;
      const { change } = decision;
      const note = readinessNote(
        readiness(state),
        readiness(stateAfter(state, change)),
        change,
      );
      let says = [decision.says, note].filter(Boolean).join(" ");
      if (change?.type === "facts") {
        const saved = await saveTripFacts(tx, userId, tripId, change.facts);
        if (typeof saved === "string") return saved;
      }
      if (change?.type === "taste") {
        await saveTripAnswer(tx, tripId, change.topic, change.answer);
        // The pace answer is also the plan's pace: it sets how many slots a day has.
        const pace = PACES.find((item) => item === change.answer.values[0]);
        if (
          change.topic === "pace" &&
          pace &&
          (await setPlanPace(tx, trip, userId, pace))
        ) {
          says += ` The plan now follows a ${pace} pace.`;
        }
      }
      if (change?.type === "skip_fact") {
        await skipFact(tx, tripId, change.topic);
      }
      if (change?.type === "commitment") {
        const added = await addCommitment(
          tx,
          userId,
          tripId,
          change.commitment,
        );
        if (typeof added === "string") return added;
        const known = new Set(trip.commitments.map((item) => item.id));
        const fresh = added.commitments.find((item) => !known.has(item.id));
        const clashes =
          fresh &&
          added.clashes.some(
            (clash) => clash.first === fresh.id || clash.second === fresh.id,
          );
        if (clashes) {
          says +=
            " It overlaps with something else you have decided. Have a look under Already decided.";
        }
      }

      // The waiting question joins the thread the first time the traveller
      // responds while it is on screen.
      const asked: NewMessage[] =
        waiting && (await lastQuestionTopic(tx, tripId)) !== waiting.topic
          ? [
              {
                from: "agent",
                body: {
                  kind: "question",
                  topic: waiting.topic,
                  text: waiting.prompt,
                },
              },
            ]
          : [];
      await appendMessages(tx, tripId, [
        ...asked,
        { from: "traveller", body: { kind: "text", text: said } },
        { from: "agent", body: { kind: "text", text: says } },
      ]);
      return {
        focus: change?.type === "go_to" ? change.slotId : null,
        changed: change !== null && change.type !== "go_to",
      };
    },
  });
}

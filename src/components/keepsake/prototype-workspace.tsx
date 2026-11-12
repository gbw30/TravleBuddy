"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { flushSync } from "react-dom";

import {
  buildRest,
  changedSlots,
  currentProposal,
  initialState,
  moveItem,
  offeredCount,
  pickCard,
  placeFromShelf,
  removeItem,
  saveForLater,
  setActiveSlot,
  showOthers,
  undo,
} from "@/features/prototype/planning-state";
import { read, subscribe, write } from "@/features/prototype/session-store";
import type {
  Entry,
  PlanningState,
  SamplePlace,
  SampleTrip,
} from "@/features/prototype/types";

import { AgentMessage } from "./agent-message";
import { CloserLook } from "./closer-look";
import { CommitmentsPanel } from "./commitments-panel";
import { DiscardReasons } from "./discard-reasons";
import { LiveItinerary } from "./live-itinerary";
import { Postcard } from "./postcard";
import { Shelf } from "./shelf";
import { eyebrow, fieldLarge, pill, pillPrimary } from "./styles";

export type WorkspaceOptions = {
  photos: boolean;
  closerLook: "enlarged" | "overlay";
  phoneItinerary: "sheet" | "tab";
  built: boolean;
};

// Sample of a place the Quick plan build "could not fit" (PRD 11.4).
const SHELVED_BY_BUILD = "sasanoyuki";

type ViewTransitionDocument = Document & {
  startViewTransition(update: () => void): { finished: Promise<void> };
};

function parse(raw: string | null, trip: SampleTrip): PlanningState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PlanningState;
    return Array.isArray(value.entries) &&
      value.entries.length === trip.slots.length
      ? value
      : null;
  } catch {
    return null;
  }
}

export function PrototypeWorkspace({
  trip,
  options,
}: {
  trip: SampleTrip;
  options: WorkspaceOptions;
}) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const base = useMemo(() => {
    const start = initialState(trip);
    if (!options.built) return start;
    const built = buildRest(trip, start);
    // A freshly built trip is the starting point: nothing to undo yet.
    return {
      ...(trip.places[SHELVED_BY_BUILD]
        ? saveForLater(built, SHELVED_BY_BUILD)
        : built),
      past: [],
    };
  }, [trip, options.built]);
  const state = useMemo(() => parse(raw, trip) ?? base, [raw, trip, base]);

  const [transit, setTransit] = useState<{
    placeId: string;
    slotId: string;
  } | null>(null);
  const [looking, setLooking] = useState<SamplePlace | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [typed, setTyped] = useState<string[]>([]);
  const [phoneView, setPhoneView] = useState<"plan" | "itinerary">("plan");
  // The itinerary as it was when last looked at on a phone.
  const [seen, setSeen] = useState<Entry[] | null>(null);

  const update = (next: PlanningState) => {
    if (next !== state) write(JSON.stringify(next));
  };

  const proposal = currentProposal(trip, state);
  const activeSlot = trip.slots.find((s) => s.id === state.activeSlotId);
  const agentLine = activeSlot
    ? (trip.agentLines[activeSlot.id] ??
      `For ${activeSlot.label.toLowerCase()} on Day ${activeSlot.day} at ${activeSlot.start}, here is what else would fit.`)
    : "Every slot is filled. Move anything you like.";
  const openSlots = trip.slots
    .filter(
      (slot) =>
        state.entries.find((e) => e.slotId === slot.id)?.type === "open",
    )
    .map((slot) => ({
      value: slot.id,
      label: `Day ${slot.day} · ${slot.start} ${slot.label}`,
    }));
  const itineraryOpen = phoneView === "itinerary";
  const changes = itineraryOpen
    ? 0
    : changedSlots(state.entries, seen ?? base.entries);
  const offered = offeredCount(trip, state);

  function pick(placeId: string) {
    const slotId = state.activeSlotId;
    if (!slotId) return;
    const next = pickCard(trip, state, placeId);
    setHeard(null);
    if (!("startViewTransition" in document)) {
      update(next);
      return;
    }
    // Name the card before the browser captures the "before" picture, so it
    // can animate from the card to the itinerary row that takes the same name.
    flushSync(() => setTransit({ placeId, slotId }));
    (document as ViewTransitionDocument)
      .startViewTransition(() => flushSync(() => update(next)))
      .finished.finally(() => setTransit(null));
  }

  function say(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem(
      "message",
    ) as HTMLInputElement;
    if (!input.value.trim()) return;
    setTyped((list) => [...list, input.value.trim()]);
    input.value = "";
  }

  function showPhoneView(view: "plan" | "itinerary") {
    setPhoneView(view);
    setSeen(state.entries);
  }

  const itinerary = (
    <LiveItinerary
      trip={trip}
      state={state}
      transit={transit}
      onActivate={(slotId) => {
        update(setActiveSlot(state, slotId));
        showPhoneView("plan");
      }}
      onMove={(from, to) => update(moveItem(trip, state, from, to))}
      onRemove={(slotId) => update(removeItem(state, slotId))}
      onLook={(placeId) => setLooking(trip.places[placeId])}
    />
  );

  return (
    <div
      data-qa="prototype-workspace"
      data-ready={ready}
      className={options.phoneItinerary === "sheet" ? "pb-16 lg:pb-0" : ""}
    >
      <header className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <h1 className="text-2xl font-bold">{trip.title}</h1>
          <p className="text-sm opacity-75">
            {trip.days[0].date} to {trip.days.at(-1)!.date} · 1 traveller
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={pill}
            disabled={state.past.length === 0}
            onClick={() => update(undo(state))}
          >
            Undo
          </button>
          <button
            type="button"
            className={pill}
            disabled={openSlots.length === 0}
            onClick={() => update(buildRest(trip, state))}
          >
            Build the rest for me
          </button>
          <button type="button" className={pill} onClick={() => write(null)}>
            Reset prototype
          </button>
        </div>
      </header>

      {options.built && (
        <section
          data-qa="build-report"
          aria-labelledby="report-heading"
          className="mb-6 rounded-lg border border-row-edge bg-row p-4"
        >
          <h2 id="report-heading" className="text-lg font-bold">
            Your trip is built
          </h2>
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className={eyebrow}>What I built</h3>
              <p>
                Three days in Tokyo around your flight, your hotel and your
                teamLab ticket. Each morning has one main sight, and every meal
                is vegetarian-friendly.
              </p>
            </div>
            <div>
              <h3 className={eyebrow}>What I assumed</h3>
              <ul className="space-y-1">
                {[
                  "A relaxed pace, from your Kyoto trip.",
                  "Days start at 10:00, from your Kyoto trip.",
                  "About ¥15,000 a day, as you gave no budget.",
                ].map((assumption) => (
                  <li key={assumption}>
                    {assumption}{" "}
                    <Link
                      href="/prototype/quick-plan"
                      className="font-semibold text-terracotta underline"
                    >
                      Change
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={eyebrow}>What I could not fit</h3>
              <p>
                Sasanoyuki is on your shelf. It closes before you could get
                there on Day 1.
              </p>
            </div>
            <div>
              <h3 className={eyebrow}>Where I was unsure</h3>
              <p>
                Two lunch places were close for Day 2. I chose the one on your
                way to teamLab.{" "}
                <button
                  type="button"
                  className="font-semibold text-terracotta underline"
                  onClick={() => update(setActiveSlot(state, "d2-lunch"))}
                >
                  Let me choose
                </button>
              </p>
            </div>
          </div>
        </section>
      )}

      {options.phoneItinerary === "tab" && (
        <div role="tablist" className="mb-4 flex gap-2 lg:hidden">
          <button
            type="button"
            role="tab"
            aria-selected={!itineraryOpen}
            className={`${pill} aria-selected:bg-terracotta-deep aria-selected:text-white`}
            onClick={() => showPhoneView("plan")}
          >
            Plan with me
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={itineraryOpen}
            data-qa="itinerary-toggle"
            className={`${pill} aria-selected:bg-terracotta-deep aria-selected:text-white`}
            onClick={() => showPhoneView(itineraryOpen ? "plan" : "itinerary")}
          >
            Itinerary{changes > 0 ? ` · ${changes} new` : ""}
          </button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
        <div
          className={`min-w-0 space-y-8 ${options.phoneItinerary === "tab" && itineraryOpen ? "hidden lg:block" : ""}`}
        >
          <section aria-label="Conversation" className="space-y-4">
            <AgentMessage>
              I have placed your flight, your hotel and your teamLab ticket
              first. I remember from your Kyoto trip that you like late starts,
              so your days begin at 10:00.
            </AgentMessage>
            <div className="text-sm">
              <AgentMessage>How packed should the days be?</AgentMessage>
              <p className="mt-2 flex flex-wrap gap-2">
                {["Packed", "Balanced", "Relaxed"].map((pace) => (
                  <span
                    key={pace}
                    className={pace === "Relaxed" ? pillPrimary : pill}
                  >
                    {pace}
                    {pace === "Relaxed" && (
                      <span className="sr-only"> (your answer)</span>
                    )}
                  </span>
                ))}
              </p>
            </div>
            {typed.map((message, index) => (
              <div key={index} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-card px-4 py-2 text-sm [overflow-wrap:anywhere]">
                  {message}
                </p>
                <AgentMessage>
                  Thank you. In the finished product I would act on that. This
                  prototype only shows how the conversation feels.
                </AgentMessage>
              </div>
            ))}
            {heard && <AgentMessage>{heard}</AgentMessage>}
            <AgentMessage>{agentLine}</AgentMessage>
            {activeSlot && offered === 0 && (
              <AgentMessage>I have no more places for this slot.</AgentMessage>
            )}
            {offered > 0 && proposal.length === 0 && (
              <AgentMessage>
                The other places for this slot are on your shelf.
              </AgentMessage>
            )}
            {offered > 0 && offered < 3 && (
              <AgentMessage>I only found {offered} that fit.</AgentMessage>
            )}

            {proposal.length > 0 && (
              <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                {proposal.map((place) => (
                  <li
                    key={place.id}
                    className="w-[78%] shrink-0 snap-start sm:w-auto"
                    style={
                      transit?.placeId === place.id
                        ? { viewTransitionName: "picked-card" }
                        : undefined
                    }
                  >
                    <Postcard
                      place={place}
                      showPhoto={options.photos}
                      onPick={() => pick(place.id)}
                      onSave={() => update(saveForLater(state, place.id))}
                      onCloserLook={() => setLooking(place)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {proposal.length > 0 &&
              (discarding ? (
                <DiscardReasons
                  onCancel={() => setDiscarding(false)}
                  onConfirm={(reasons) => {
                    setDiscarding(false);
                    setHeard(
                      reasons.length > 0
                        ? `Noted: ${reasons.join(", ").toLowerCase()}. I will keep that in mind for this trip.`
                        : null,
                    );
                    update(showOthers(trip, state));
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={pill}
                  onClick={() => setDiscarding(true)}
                >
                  Show me others
                </button>
              ))}

            <form onSubmit={say} className="flex gap-2">
              <input
                name="message"
                aria-label="Message the agent"
                placeholder="Tell me anything, such as “I've booked dinner on Tuesday”"
                className={`${fieldLarge} min-w-0 flex-1`}
              />
              <button type="submit" className={pillPrimary}>
                Send
              </button>
            </form>
          </section>

          <Shelf
            places={state.shelf.map((id) => trip.places[id])}
            openSlots={openSlots}
            onPlace={(placeId, slotId) =>
              update(placeFromShelf(trip, state, placeId, slotId))
            }
            onLook={(placeId) => setLooking(trip.places[placeId])}
          />
          <CommitmentsPanel initial={trip.commitments} />
        </div>

        {options.phoneItinerary === "tab" ? (
          <aside
            aria-label="Itinerary"
            className={itineraryOpen ? "" : "hidden lg:block"}
          >
            {itinerary}
          </aside>
        ) : (
          <aside
            aria-label="Itinerary"
            className="fixed inset-x-0 bottom-14 z-10 rounded-t-2xl border-t border-row-edge bg-paper px-4 shadow-[0_-4px_12px_rgb(60_40_20/0.25)] md:bottom-0 lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:shadow-none"
          >
            <button
              type="button"
              data-qa="itinerary-toggle"
              aria-expanded={itineraryOpen}
              onClick={() =>
                showPhoneView(itineraryOpen ? "plan" : "itinerary")
              }
              className="flex w-full items-center justify-between py-3 font-sans text-sm font-semibold lg:hidden"
            >
              <span>Itinerary{changes > 0 ? ` · ${changes} new` : ""}</span>
              <span aria-hidden>{itineraryOpen ? "▾" : "▴"}</span>
            </button>
            <div
              className={
                itineraryOpen
                  ? "max-h-[65vh] overflow-y-auto pb-4 lg:max-h-none lg:overflow-visible"
                  : "hidden lg:block"
              }
            >
              {itinerary}
            </div>
          </aside>
        )}
      </div>

      <CloserLook
        place={looking}
        variant={options.closerLook}
        showPhoto={options.photos}
        onClose={() => setLooking(null)}
      />
    </div>
  );
}

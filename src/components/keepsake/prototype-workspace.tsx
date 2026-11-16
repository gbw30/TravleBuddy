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
import { eyebrow, quiet } from "./styles";

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
  const planned = state.entries.filter((e) => e.type !== "open").length;

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
      className={options.phoneItinerary === "sheet" ? "pb-20 lg:pb-0" : ""}
    >
      <header className="grid items-end gap-6 border-b border-ink/12 py-9 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10 md:py-12">
        <div>
          <p className={eyebrow}>
            {trip.days[0].city} · {trip.days[0].date} to{" "}
            {trip.days.at(-1)!.date} · 1 traveller
          </p>
          <h1 className="mt-3 text-[40px] leading-[1.04] font-medium tracking-[-0.025em] text-balance md:text-[60px]">
            {trip.title}
          </h1>
        </div>
        <div className="font-sans text-[13px] text-muted md:text-right">
          <p>
            {planned} of {state.entries.length} moments planned
          </p>
          <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-ink/12 md:ml-auto md:w-56">
            <div
              className="h-full bg-ink"
              style={{ width: `${(planned / state.entries.length) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 md:justify-end">
            <button
              type="button"
              className={quiet}
              disabled={state.past.length === 0}
              onClick={() => update(undo(state))}
            >
              Undo
            </button>
            <button
              type="button"
              className={quiet}
              disabled={openSlots.length === 0}
              onClick={() => update(buildRest(trip, state))}
            >
              Build the rest for me
            </button>
            <button type="button" className={quiet} onClick={() => write(null)}>
              Reset prototype
            </button>
          </div>
        </div>
      </header>

      {options.built && (
        <section
          data-qa="build-report"
          aria-labelledby="report-heading"
          className="mt-8 rounded-[14px] bg-card p-6 shadow-sheet md:p-8"
        >
          <h2
            id="report-heading"
            className="text-[28px] leading-tight font-medium tracking-[-0.02em]"
          >
            Your trip is <em>built</em>
          </h2>
          <div className="mt-5 grid gap-x-10 gap-y-6 text-[15px] sm:grid-cols-2">
            <div>
              <h3 className={eyebrow}>What I built</h3>
              <p className="mt-1.5">
                Three days in Tokyo around your flight, your hotel and your
                teamLab ticket. Each morning has one main sight, and every meal
                is vegetarian-friendly.
              </p>
            </div>
            <div>
              <h3 className={eyebrow}>What I assumed</h3>
              <ul className="mt-1.5 space-y-1">
                {[
                  "A relaxed pace, from your Kyoto trip.",
                  "Days start at 10:00, from your Kyoto trip.",
                  "About ¥15,000 a day, as you gave no budget.",
                ].map((assumption) => (
                  <li key={assumption}>
                    {assumption}{" "}
                    <Link href="/prototype/quick-plan" className={quiet}>
                      Change
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={eyebrow}>What I could not fit</h3>
              <p className="mt-1.5">
                Sasanoyuki is on your shelf. It closes before you could get
                there on Day 1.
              </p>
            </div>
            <div>
              <h3 className={eyebrow}>Where I was unsure</h3>
              <p className="mt-1.5">
                Two lunch places were close for Day 2. I chose the one on your
                way to teamLab.{" "}
                <button
                  type="button"
                  className={quiet}
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
        <div role="tablist" className="mt-6 flex gap-2 lg:hidden">
          <button
            type="button"
            role="tab"
            aria-selected={!itineraryOpen}
            className={tab}
            onClick={() => showPhoneView("plan")}
          >
            Plan with me
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={itineraryOpen}
            data-qa="itinerary-toggle"
            className={tab}
            onClick={() => showPhoneView(itineraryOpen ? "plan" : "itinerary")}
          >
            Itinerary{changes > 0 ? ` · ${changes} new` : ""}
          </button>
        </div>
      )}

      <div className="pt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-16 lg:pt-11">
        <div
          className={`min-w-0 space-y-14 ${options.phoneItinerary === "tab" && itineraryOpen ? "hidden lg:block" : ""}`}
        >
          <section aria-label="Conversation" className="space-y-5">
            <div className="grid max-w-[620px] grid-cols-[2rem_minmax(0,1fr)] gap-3.5 md:grid-cols-[2.5rem_minmax(0,1fr)] md:gap-[18px]">
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-full border-[1.5px] border-terracotta text-sm text-terracotta italic md:size-10 md:text-[17px]"
              >
                tb
              </span>
              <div className="space-y-4">
                <AgentMessage>
                  I have placed your flight, your hotel and your teamLab ticket
                  first. I remember from your Kyoto trip that you like late
                  starts, so your days begin at 10:00.
                </AgentMessage>
                <div>
                  <AgentMessage>How packed should the days be?</AgentMessage>
                  <p className="mt-2.5 flex flex-wrap gap-2">
                    {["Packed", "Balanced", "Relaxed"].map((pace) => (
                      <span
                        key={pace}
                        className={`inline-flex h-8 items-center rounded-full px-3.5 font-sans text-[13px] ${pace === "Relaxed" ? "bg-ink text-paper" : "text-muted shadow-[inset_0_0_0_1px_rgb(29_26_22/0.2)]"}`}
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
                  <div key={index} className="space-y-3">
                    <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-card px-4 py-2 text-[15px] shadow-[0_0_0_1px_rgb(29_26_22/0.1)] [overflow-wrap:anywhere]">
                      {message}
                    </p>
                    <AgentMessage>
                      Thank you. In the finished product I would act on that.
                      This prototype only shows how the conversation feels.
                    </AgentMessage>
                  </div>
                ))}
                {heard && <AgentMessage>{heard}</AgentMessage>}
              </div>
            </div>

            {activeSlot && (
              <div className="pt-6">
                <p className={eyebrow}>
                  <span className="font-semibold text-terracotta">
                    Day {activeSlot.day}
                  </span>{" "}
                  · {activeSlot.label} · {activeSlot.start}
                </p>
                <h2 className="mt-3 text-[31px] leading-[1.1] font-medium tracking-[-0.02em] text-balance md:text-[40px]">
                  Choosing your <em>{activeSlot.label.toLowerCase()}</em>
                </h2>
              </div>
            )}
            <div className="max-w-[620px] space-y-3 text-ink/80">
              <AgentMessage>{agentLine}</AgentMessage>
              {activeSlot && offered === 0 && (
                <AgentMessage>
                  I have no more places for this slot.
                </AgentMessage>
              )}
              {offered > 0 && proposal.length === 0 && (
                <AgentMessage>
                  The other places for this slot are on your shelf.
                </AgentMessage>
              )}
              {offered > 0 && offered < 3 && (
                <AgentMessage>I only found {offered} that fit.</AgentMessage>
              )}
            </div>

            {proposal.length > 0 && (
              <ul className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pt-2 pb-6 sm:mx-0 sm:grid sm:grid-cols-3 sm:items-start sm:gap-0 sm:overflow-visible sm:px-0 sm:pt-6 sm:pb-8">
                {proposal.map((place) => (
                  <li
                    key={place.id}
                    className={fan}
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
                  className={`${quiet} text-sm`}
                  onClick={() => setDiscarding(true)}
                >
                  None of these?&nbsp;Show me others
                  <span aria-hidden>&nbsp;→</span>
                </button>
              ))}

            <form
              onSubmit={say}
              className="flex max-w-[620px] items-center gap-3 border-b-[1.5px] border-ink pt-6 pb-2.5"
            >
              <input
                name="message"
                aria-label="Message the agent"
                placeholder="Tell me what you would rather do…"
                className="min-w-0 flex-1 bg-transparent text-lg italic placeholder:text-muted"
              />
              <button
                type="submit"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-sans text-paper"
              >
                <span aria-hidden>↑</span>
                <span className="sr-only">Send</span>
              </button>
            </form>
          </section>

          <Shelf
            places={state.shelf.map((id) => trip.places[id])}
            showPhoto={options.photos}
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
            className={`${sheet} p-5 lg:p-6 ${itineraryOpen ? "" : "hidden lg:block"}`}
          >
            {sheetTitle}
            {itinerary}
          </aside>
        ) : (
          <aside
            aria-label="Itinerary"
            className={`fixed inset-x-3 bottom-3 z-10 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgb(29_26_22/0.3)] lg:static lg:overflow-visible lg:p-6 ${sheet}`}
          >
            <button
              type="button"
              data-qa="itinerary-toggle"
              aria-expanded={itineraryOpen}
              onClick={() =>
                showPhoneView(itineraryOpen ? "plan" : "itinerary")
              }
              className="flex w-full items-center justify-between bg-ink px-5 py-3.5 font-sans text-sm font-medium text-paper lg:hidden"
            >
              <span>Itinerary{changes > 0 ? ` · ${changes} new` : ""}</span>
              <span aria-hidden>{itineraryOpen ? "▾" : "▴"}</span>
            </button>
            <div
              className={
                itineraryOpen
                  ? "max-h-[65vh] overflow-y-auto overscroll-contain p-4 lg:max-h-none lg:overflow-visible lg:p-0"
                  : "hidden lg:block"
              }
            >
              {sheetTitle}
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

// The itinerary is one sheet of paper. Ticket stubs on it take its colour.
const sheet =
  "rounded-[14px] bg-card [--notch:var(--color-card)] lg:shadow-sheet";
const sheetTitle = (
  <h2 className="mb-6 hidden text-2xl font-medium tracking-[-0.02em] lg:block">
    Itinerary
  </h2>
);
const tab =
  "inline-flex min-h-9 items-center rounded-full px-4 font-sans text-[13px] text-ink shadow-[inset_0_0_0_1px_rgb(29_26_22/0.2)] aria-selected:bg-ink aria-selected:text-paper";
// Three postcards fanned on a table; a plain row to swipe on a phone.
const fan =
  "w-[78%] shrink-0 snap-center sm:w-auto sm:nth-1:translate-x-2.5 sm:nth-1:translate-y-3.5 sm:nth-1:-rotate-[2.2deg] sm:nth-2:relative sm:nth-2:z-[2] sm:nth-2:-translate-y-1.5 sm:nth-3:-translate-x-2.5 sm:nth-3:translate-y-4 sm:nth-3:rotate-2";

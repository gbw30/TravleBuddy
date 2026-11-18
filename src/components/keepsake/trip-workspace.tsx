"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { PACES, type PlanAction } from "@/features/itinerary/contracts";
import { PLACE_KINDS, kindLabel } from "@/features/places/contracts";
import {
  discardReason,
  type CardDto,
} from "@/features/recommendations/contracts";
import { callApi, changeTrip } from "@/lib/trip-api";
import type { PlanSnapshot } from "@/use-cases/plan-snapshot";

import { AgentMessage } from "./agent-message";
import { CloserLook } from "./closer-look";
import { DiscardReasons } from "./discard-reasons";
import { dayLabel } from "./format";
import { PlanItinerary, slotOptions, slotWord } from "./plan-itinerary";
import { Postcard } from "./postcard";
import { Shelf } from "./shelf";
import { button, buttonSecond, chip, eyebrow, field, quiet } from "./styles";
import type { CardPlace } from "./types";

/** A card's data in the shape the postcard draws. Unknown facts stay null. */
function toCardPlace(card: CardDto): CardPlace {
  return {
    id: card.placeId,
    name: card.name,
    essentials: card.essentials,
    summary: card.summary,
    reason: card.reason,
    address: card.address ?? "Address not known",
    hours: card.hours,
    priceLevel: null,
    rating: null,
    photo: null,
    photoCredit: null,
  };
}

const blockerWord = {
  where: "where you are going",
  when: "when you are going",
  nights: "how many nights you spend in each city",
};
const sheet =
  "rounded-[14px] bg-card [--notch:var(--color-card)] lg:shadow-sheet";
// Three postcards fanned on a table; a plain row to swipe on a phone.
const fan =
  "w-[78%] shrink-0 snap-center sm:w-auto sm:nth-1:translate-x-2.5 sm:nth-1:translate-y-3.5 sm:nth-1:-rotate-[2.2deg] sm:nth-2:relative sm:nth-2:z-[2] sm:nth-2:-translate-y-1.5 sm:nth-3:-translate-x-2.5 sm:nth-3:translate-y-4 sm:nth-3:rotate-2";

/**
 * The planning workspace (PRD 6): the cards for the slot being chosen, the
 * live itinerary, and the shelf. The server holds the plan; every action goes
 * to it and the plan it answers is shown.
 */
export function TripWorkspace({
  tripId,
  revision,
  initial,
  readOnly,
}: {
  tripId: string;
  revision: number;
  initial: PlanSnapshot;
  readOnly: boolean;
}) {
  const [plan, setPlan] = useState(initial);
  const [transit, setTransit] = useState<{
    placeId: string;
    slotId: string;
  } | null>(null);
  const [looking, setLooking] = useState<CardPlace | null>(null);
  /** The cards being turned down: the whole set, or one card. */
  const [discarding, setDiscarding] = useState<string[] | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [found, setFound] = useState<CardDto[] | null>(null);
  const [searchNote, setSearchNote] = useState("");
  const asked = useRef(false);

  const { view, proposal } = plan;
  const focus = proposal?.slotId ?? null;
  const focusEntry = view.days
    .flatMap((day) => day.entries.map((entry) => ({ day, entry })))
    .find(({ entry }) => "slotId" in entry && entry.slotId === focus);
  const focusSlot =
    focusEntry &&
    (focusEntry.entry.type === "open" || focusEntry.entry.type === "place")
      ? { day: focusEntry.day.day, ...focusEntry.entry }
      : null;

  async function refresh(slot?: string | null) {
    const result = await callApi<{ plan: PlanSnapshot }>(
      `/api/v1/trips/${tripId}/plan${slot ? `?slot=${slot}` : ""}`,
      { method: "GET" },
    );
    if (result.ok) setPlan(result.data.plan);
    else setProblem(result.message);
  }

  // The page loads without waiting for the place provider; ask for the
  // places now. Once is enough: the answer says ready, unavailable or capped.
  useEffect(() => {
    if (proposal?.status !== "pending" || asked.current) return;
    asked.current = true;
    void refresh(proposal.slotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the status turns pending
  }, [proposal?.status]);

  async function send(
    action: PlanAction,
    nextFocus?: string | null,
  ): Promise<PlanSnapshot | null> {
    setBusy(true);
    setProblem(null);
    const result = await changeTrip<{ plan: PlanSnapshot }>(
      tripId,
      revision,
      "POST",
      { action, ...(nextFocus ? { focus: nextFocus } : {}) },
      "/plan",
    );
    setBusy(false);
    if (result.ok) return result.data.plan;
    setProblem(result.message);
    // A stale screen is brought up to date before the next try.
    if (result.error === "stale_revision") void refresh(focus);
    return null;
  }

  async function act(action: PlanAction, nextFocus?: string | null) {
    const next = await send(action, nextFocus);
    if (next) setPlan(next);
  }

  /** Picks a card; where the browser can, the card is seen to move to its slot. */
  async function pick(placeId: string, slotId: string) {
    const next = await send({ type: "pick", slotId, placeId });
    if (!next) return;
    setFound(null);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("startViewTransition" in document) || still) {
      setPlan(next);
      return;
    }
    flushSync(() => setTransit({ placeId, slotId }));
    document
      .startViewTransition(() => flushSync(() => setPlan(next)))
      .finished.catch(() => undefined)
      .finally(() => setTransit(null));
  }

  async function searchByName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("q") ?? "",
    ).trim();
    if (query.length < 2) return;
    setSearchNote("Searching…");
    const result = await callApi<{ cards: CardDto[] }>(
      `/api/v1/trips/${tripId}/places?q=${encodeURIComponent(query)}${focus ? `&slot=${focus}` : ""}`,
      { method: "GET" },
    );
    if (!result.ok) {
      setFound(null);
      setSearchNote(result.message);
      return;
    }
    setFound(result.data.cards);
    setSearchNote(
      result.data.cards.length === 0
        ? `I could not find “${query}”. You can add it by hand below.`
        : `${result.data.cards.length} found.`,
    );
  }

  async function addByHand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Kept now: the event no longer names the form once the request returns.
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await callApi<{ card: CardDto }>(
      `/api/v1/trips/${tripId}/places`,
      {
        method: "POST",
        body: {
          name: String(data.get("name") ?? ""),
          kind: String(data.get("kind") ?? "sight"),
          ...(focus ? { slotId: focus } : {}),
        },
      },
    );
    if (!result.ok) {
      setSearchNote(result.message);
      return;
    }
    setFound([result.data.card]);
    setSearchNote("Added. Pick it for this slot or save it for later.");
    form.reset();
  }

  if (view.blockers.length > 0) {
    return (
      <section
        data-qa="trip-workspace"
        aria-label="The plan"
        className="max-w-[620px]"
      >
        <AgentMessage>
          Before I can lay out the days, I need to know{" "}
          {view.blockers.map((blocker) => blockerWord[blocker]).join(" and ")}.
          Fill it in under{" "}
          <a href="#facts-heading" className={quiet}>
            the facts
          </a>{" "}
          below and I will start proposing places.
        </AgentMessage>
      </section>
    );
  }

  const cards = proposal?.cards ?? [];
  const itinerary = (
    <PlanItinerary
      view={view}
      chosen={plan.chosen}
      focusSlotId={focus}
      transit={transit}
      readOnly={readOnly}
      onFocus={(slotId) => void refresh(slotId)}
      onMove={(fromSlotId, toSlotId) =>
        act({ type: "move", fromSlotId, toSlotId }, focus)
      }
      onRemove={(slotId) => act({ type: "remove", slotId }, focus)}
      onLook={(placeId) =>
        plan.chosen[placeId] && setLooking(toCardPlace(plan.chosen[placeId]))
      }
      onMinutes={(slotId, minutes) =>
        act({ type: "minutes", slotId, minutes }, focus)
      }
      onTransfer={(day, start) => act({ type: "transfer", day, start }, focus)}
    />
  );

  return (
    <section data-qa="trip-workspace" aria-label="The plan">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-16">
        <div className="min-w-0 space-y-12 pb-24 lg:pb-0">
          <div className="space-y-5">
            <div className="max-w-[620px] space-y-3">
              {view.provisionalDates && view.days[0] && (
                <AgentMessage>
                  You have not set dates, so I am planning as if you arrive on{" "}
                  {dayLabel(view.days[0].date)}. Change the dates in the facts
                  at any time.
                </AgentMessage>
              )}
              <div>
                <AgentMessage>How packed should the days be?</AgentMessage>
                <p className="mt-2.5 flex flex-wrap gap-2">
                  {PACES.map((pace) => (
                    <button
                      key={pace}
                      type="button"
                      aria-pressed={view.pace === pace}
                      disabled={readOnly || busy}
                      className={chip}
                      onClick={() => act({ type: "pace", pace }, null)}
                    >
                      {pace[0].toUpperCase() + pace.slice(1)}
                    </button>
                  ))}
                </p>
              </div>
            </div>

            {focusSlot && (
              <div className="pt-4">
                <p className={eyebrow}>
                  <span className="font-semibold text-terracotta">
                    Day {focusSlot.day}
                  </span>{" "}
                  · {slotWord[focusSlot.kind]} · {focusSlot.start}
                </p>
                <h2 className="mt-3 text-[32px] leading-[1.06] tracking-[-0.03em] text-balance md:text-[46px]">
                  {focusSlot.type === "place" ? "Swapping" : "Choosing"} your{" "}
                  <em>{slotWord[focusSlot.kind].toLowerCase()}</em>
                </h2>
              </div>
            )}

            <div
              className="max-w-[620px] space-y-3 text-ink/80"
              aria-live="polite"
            >
              {plan.holding === "food" && (
                <AgentMessage>
                  I can suggest places to eat once you have told me about food.
                  Answer or skip that question and I will.
                </AgentMessage>
              )}
              {!proposal && !plan.holding && (
                <AgentMessage>
                  Every slot is filled. Swap, move or remove anything in the
                  itinerary, and I will check the plan again.
                </AgentMessage>
              )}
              {proposal?.status === "pending" && (
                <AgentMessage>
                  Looking for places in {proposal.cityName}…
                </AgentMessage>
              )}
              {proposal?.status === "unavailable" && (
                <AgentMessage>
                  I could not reach the place provider just now.{" "}
                  {cards.length > 0
                    ? "These come from places already saved."
                    : "Try again in a moment, or add a place of your own."}
                </AgentMessage>
              )}
              {proposal?.status === "capped" && (
                <AgentMessage>
                  Today’s place lookups are used up.{" "}
                  {cards.length > 0
                    ? "These come from places already saved."
                    : "Add a place of your own, or come back tomorrow."}
                </AgentMessage>
              )}
              {proposal && focusSlot && cards.length === 3 && (
                <AgentMessage>
                  For your {slotWord[focusSlot.kind].toLowerCase()} on day{" "}
                  {focusSlot.day}, three places that fit. Turn a card over to
                  see why.
                </AgentMessage>
              )}
              {proposal?.status === "ready" && cards.length === 0 && (
                <AgentMessage>
                  I have no more places for this slot.
                </AgentMessage>
              )}
              {cards.length > 0 && cards.length < 3 && (
                <AgentMessage>
                  I only found {cards.length} that fit.
                </AgentMessage>
              )}
              {heard && <AgentMessage>{heard}</AgentMessage>}
              <p role="alert" className="font-sans text-[14px] text-stamp">
                {problem}
              </p>
            </div>

            {cards.length > 0 && focus && (
              <ul className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pt-2 pb-6 sm:mx-0 sm:grid sm:grid-cols-3 sm:items-start sm:gap-0 sm:overflow-visible sm:px-0 sm:pt-6 sm:pb-8">
                {cards.map((card) => (
                  <li
                    key={card.placeId}
                    className={fan}
                    style={
                      transit?.placeId === card.placeId
                        ? { viewTransitionName: "picked-card" }
                        : undefined
                    }
                  >
                    <Postcard
                      place={toCardPlace(card)}
                      showPhoto
                      onPick={
                        readOnly ? undefined : () => pick(card.placeId, focus)
                      }
                      onSave={
                        readOnly
                          ? undefined
                          : () =>
                              act(
                                { type: "save", placeId: card.placeId },
                                focus,
                              )
                      }
                      onCloserLook={() => setLooking(toCardPlace(card))}
                    />
                    {!readOnly && (
                      // No hidden text here: inside a sideways scroller it
                      // would sit outside the row and widen the page.
                      <button
                        type="button"
                        className={`${quiet} mt-2`}
                        aria-label={`Not this one: ${card.name}`}
                        onClick={() => setDiscarding([card.placeId])}
                      >
                        Not this one
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {cards.length > 0 &&
              focus &&
              !readOnly &&
              (discarding ? (
                <DiscardReasons
                  onCancel={() => setDiscarding(null)}
                  onConfirm={async (given) => {
                    const placeIds = discarding;
                    setDiscarding(null);
                    const reasons = given.filter((text) => discardReason(text));
                    const note = given.filter(
                      (text) => !discardReason(text),
                    )[0];
                    await act(
                      {
                        type: "others",
                        slotId: focus,
                        placeIds,
                        reasons,
                        note: note ?? null,
                      },
                      focus,
                    );
                    setHeard(
                      given.length > 0
                        ? `Noted: ${given.join(", ").toLowerCase()}. I will keep that in mind for this trip.`
                        : null,
                    );
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`${quiet} text-sm`}
                  onClick={() =>
                    setDiscarding(cards.map((card) => card.placeId))
                  }
                >
                  None of these?&nbsp;Show me others
                  <span aria-hidden>&nbsp;→</span>
                </button>
              ))}

            {!readOnly && focus && (
              <details className="max-w-[620px] pt-2">
                <summary className="cursor-pointer font-sans text-[13px] font-medium text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4">
                  Add a place of my own
                </summary>
                <form
                  onSubmit={searchByName}
                  className="mt-3 flex flex-wrap items-end gap-2"
                >
                  <label className="min-w-0 flex-1 font-sans text-[13px] text-muted">
                    Find a place by name
                    <input
                      name="q"
                      maxLength={80}
                      className={`${field} mt-1 block w-full`}
                    />
                  </label>
                  <button type="submit" className={buttonSecond}>
                    Find place
                  </button>
                </form>
                <p
                  role="status"
                  className="mt-1.5 font-sans text-[13px] text-muted"
                >
                  {searchNote}
                </p>
                {found && found.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {found.map((card) => (
                      <li
                        key={card.placeId}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-card px-4 py-3 shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
                      >
                        <span className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]">
                          <span className="block font-serif text-[19px] leading-tight">
                            {card.name}
                          </span>
                          <span className="block font-sans text-[12.5px] text-muted">
                            {card.essentials}
                            {card.address ? ` · ${card.address}` : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={button}
                          onClick={() => pick(card.placeId, focus)}
                        >
                          Pick
                          <span className="sr-only"> {card.name}</span>
                        </button>
                        <button
                          type="button"
                          className={quiet}
                          onClick={() => {
                            setFound(null);
                            void act(
                              { type: "save", placeId: card.placeId },
                              focus,
                            );
                          }}
                        >
                          Save for later
                          <span className="sr-only">: {card.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={addByHand}
                  className="mt-4 flex flex-wrap items-end gap-2"
                >
                  <label className="min-w-0 flex-1 font-sans text-[13px] text-muted">
                    Or add it by hand
                    <input
                      name="name"
                      required
                      maxLength={160}
                      className={`${field} mt-1 block w-full`}
                    />
                  </label>
                  <label className="font-sans text-[13px] text-muted">
                    Kind
                    <select name="kind" className={`${field} mt-1 block`}>
                      {PLACE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kindLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={buttonSecond}>
                    Add
                  </button>
                </form>
              </details>
            )}
          </div>

          <Shelf
            places={view.shelf.flatMap((item) =>
              plan.chosen[item.placeId]
                ? [toCardPlace(plan.chosen[item.placeId])]
                : [],
            )}
            showPhoto
            openSlots={readOnly ? [] : slotOptions(view)}
            onPlace={(placeId, slotId) => pick(placeId, slotId)}
            onLook={(placeId) =>
              plan.chosen[placeId] &&
              setLooking(toCardPlace(plan.chosen[placeId]))
            }
          />
          <p className="font-sans text-[11px] text-muted">
            Place data © OpenStreetMap contributors. Travel times and visit
            lengths are estimates.
          </p>
        </div>

        {/* On a phone the itinerary is a sheet at the foot of the screen. */}
        <aside
          aria-label="Itinerary"
          className={`fixed inset-x-3 bottom-3 z-10 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgb(29_26_22/0.3)] lg:static lg:overflow-visible lg:p-6 ${sheet}`}
        >
          <button
            type="button"
            data-qa="itinerary-toggle"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((open) => !open)}
            className="flex w-full items-center justify-between bg-ink px-5 py-3.5 font-sans text-sm font-medium text-paper lg:hidden"
          >
            <span>Itinerary</span>
            <span aria-hidden>{sheetOpen ? "▾" : "▴"}</span>
          </button>
          <div
            className={
              sheetOpen
                ? "max-h-[65vh] overflow-y-auto overscroll-contain p-4 lg:max-h-none lg:overflow-visible lg:p-0"
                : "hidden lg:block"
            }
          >
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="hidden text-[30px] leading-none tracking-[-0.025em] lg:block">
                Itinerary
              </h2>
              {!readOnly && (
                <button
                  type="button"
                  className={quiet}
                  disabled={!plan.canUndo || busy}
                  onClick={() => act({ type: "undo" }, focus)}
                >
                  Undo
                </button>
              )}
            </div>
            {itinerary}
          </div>
        </aside>
      </div>

      <CloserLook
        place={looking}
        variant="enlarged"
        showPhoto
        onClose={() => setLooking(null)}
      />
    </section>
  );
}

import type { Entry, PlanningState, SamplePlace, SampleTrip } from "./types";

type Snapshot = Omit<PlanningState, "past">;

function commit(state: PlanningState, next: Partial<Snapshot>): PlanningState {
  const { past, ...snapshot } = state;
  return { ...snapshot, ...next, past: [...past, snapshot] };
}

function nextOpen(trip: SampleTrip, entries: Entry[]): string | null {
  const open = new Set(
    entries.filter((e) => e.type === "open").map((e) => e.slotId),
  );
  return (
    trip.fillOrder.find((id) => open.has(id)) ??
    entries.find((e) => e.type === "open")?.slotId ??
    null
  );
}

/** Keeps the active slot while it is still open, otherwise moves on. */
function activeAfter(
  trip: SampleTrip,
  state: PlanningState,
  entries: Entry[],
): string | null {
  const active = entries.find((e) => e.slotId === state.activeSlotId);
  return active?.type === "open" ? active.slotId : nextOpen(trip, entries);
}

function unavailable(state: Snapshot): Set<string> {
  return new Set([
    ...state.discarded,
    ...state.shelf,
    ...state.entries.flatMap((e) => (e.type === "item" ? [e.placeId] : [])),
  ]);
}

function item(trip: SampleTrip, placeId: string, slotId: string): Entry {
  return {
    type: "item",
    slotId,
    placeId,
    locked: false,
    flag: trip.moveFlags[`${placeId}@${slotId}`] ?? null,
  };
}

const isLocked = (entry: Entry | undefined) =>
  entry?.type === "item" && entry.locked;

export function initialState(trip: SampleTrip): PlanningState {
  return {
    entries: trip.initial,
    shelf: [],
    discarded: [],
    activeSlotId: nextOpen(trip, trip.initial),
    proposalSet: {},
    past: [],
  };
}

/** The cards on offer for the active slot: none to three places. */
export function currentProposal(
  trip: SampleTrip,
  state: PlanningState,
): SamplePlace[] {
  const slot = state.activeSlotId;
  if (!slot) return [];
  const set = trip.proposals[slot]?.[state.proposalSet[slot] ?? 0] ?? [];
  const taken = unavailable(state);
  return set
    .filter((id) => !taken.has(id))
    .slice(0, 3)
    .map((id) => trip.places[id]);
}

/** How many places the current set offers, counting any saved for later. */
export function offeredCount(trip: SampleTrip, state: PlanningState): number {
  const slot = state.activeSlotId;
  if (!slot) return 0;
  const set = trip.proposals[slot]?.[state.proposalSet[slot] ?? 0] ?? [];
  const gone = unavailable({ ...state, shelf: [] });
  return set.filter((id) => !gone.has(id)).length;
}

/** How many itinerary slots differ between two versions of the plan. */
export function changedSlots(entries: Entry[], since: Entry[]): number {
  return entries.filter(
    (entry, index) => JSON.stringify(entry) !== JSON.stringify(since[index]),
  ).length;
}

export function pickCard(
  trip: SampleTrip,
  state: PlanningState,
  placeId: string,
): PlanningState {
  const slot = state.activeSlotId;
  if (!slot || isLocked(state.entries.find((e) => e.slotId === slot))) {
    return state;
  }
  const entries = state.entries.map((e) =>
    e.slotId === slot
      ? ({
          type: "item",
          slotId: slot,
          placeId,
          locked: false,
          flag: null,
        } as const)
      : e,
  );
  return commit(state, {
    entries,
    shelf: state.shelf.filter((id) => id !== placeId),
    activeSlotId: nextOpen(trip, entries),
  });
}

export function saveForLater(
  state: PlanningState,
  placeId: string,
): PlanningState {
  if (state.shelf.includes(placeId)) return state;
  return commit(state, { shelf: [...state.shelf, placeId] });
}

export function showOthers(
  trip: SampleTrip,
  state: PlanningState,
): PlanningState {
  const slot = state.activeSlotId;
  if (!slot) return state;
  return commit(state, {
    discarded: [
      ...state.discarded,
      ...currentProposal(trip, state).map((p) => p.id),
    ],
    proposalSet: {
      ...state.proposalSet,
      [slot]: (state.proposalSet[slot] ?? 0) + 1,
    },
  });
}

/** Choosing which slot to work on is navigation, so it is not undoable. */
export function setActiveSlot(
  state: PlanningState,
  slotId: string,
): PlanningState {
  if (isLocked(state.entries.find((e) => e.slotId === slotId))) return state;
  return { ...state, activeSlotId: slotId };
}

export function moveItem(
  trip: SampleTrip,
  state: PlanningState,
  fromSlotId: string,
  toSlotId: string,
): PlanningState {
  const from = state.entries.find((e) => e.slotId === fromSlotId);
  const to = state.entries.find((e) => e.slotId === toSlotId);
  if (!from || !to || from === to || from.type !== "item") return state;
  if (isLocked(from) || isLocked(to)) return state;

  const reseat = (entry: Entry, slotId: string): Entry =>
    entry.type === "item"
      ? item(trip, entry.placeId, slotId)
      : { ...entry, slotId };
  const entries = state.entries.map((e) =>
    e === from ? reseat(to, fromSlotId) : e === to ? reseat(from, toSlotId) : e,
  );
  return commit(state, {
    entries,
    activeSlotId: activeAfter(trip, state, entries),
  });
}

export function removeItem(
  state: PlanningState,
  slotId: string,
): PlanningState {
  const entry = state.entries.find((e) => e.slotId === slotId);
  if (entry?.type !== "item" || entry.locked) return state;
  return commit(state, {
    entries: state.entries.map((e) =>
      e === entry ? { type: "open", slotId } : e,
    ),
    activeSlotId: state.activeSlotId ?? slotId,
  });
}

export function placeFromShelf(
  trip: SampleTrip,
  state: PlanningState,
  placeId: string,
  slotId: string,
): PlanningState {
  const target = state.entries.find((e) => e.slotId === slotId);
  if (target?.type !== "open" || !state.shelf.includes(placeId)) return state;
  const entries = state.entries.map((e) =>
    e === target ? item(trip, placeId, slotId) : e,
  );
  return commit(state, {
    entries,
    shelf: state.shelf.filter((id) => id !== placeId),
    activeSlotId: activeAfter(trip, state, entries),
  });
}

/** Fills every open slot with the best place still on offer for it. */
export function buildRest(
  trip: SampleTrip,
  state: PlanningState,
): PlanningState {
  const taken = unavailable(state);
  const order = [...trip.fillOrder, ...trip.slots.map((s) => s.id)];
  let entries = state.entries;
  for (const slotId of new Set(order)) {
    if (entries.find((e) => e.slotId === slotId)?.type !== "open") continue;
    const placeId = (trip.proposals[slotId] ?? [])
      .slice(state.proposalSet[slotId] ?? 0)
      .flat()
      .find((id) => !taken.has(id));
    if (!placeId) continue;
    taken.add(placeId);
    entries = entries.map((e) =>
      e.slotId === slotId
        ? ({
            type: "item",
            slotId,
            placeId,
            locked: false,
            flag: null,
          } as const)
        : e,
    );
  }
  if (entries === state.entries) return state;
  return commit(state, { entries, activeSlotId: nextOpen(trip, entries) });
}

export function undo(state: PlanningState): PlanningState {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return { ...previous, past: state.past.slice(0, -1) };
}

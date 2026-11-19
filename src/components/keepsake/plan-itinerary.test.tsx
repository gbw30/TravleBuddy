import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlanView } from "@/features/itinerary/contracts";
import type { CardDto } from "@/features/recommendations/contracts";

import { PlanItinerary, slotLabel, slotOptions } from "./plan-itinerary";

const card = (placeId: string, name: string): CardDto => ({
  placeId,
  name,
  origin: "OSM",
  kind: "museum",
  essentials: "Museum",
  summary: "Museum in Tokyo.",
  reason: "You chose this for day 1.",
  address: null,
  hours: null,
  visitMinutes: 120,
  travel: null,
});

const view: PlanView = {
  blockers: [],
  pace: "balanced",
  provisionalDates: false,
  shelf: [],
  unplaced: [
    {
      commitmentId: "u",
      title: "Skytree",
      reason: "That day has no free slot.",
    },
  ],
  days: [
    {
      day: 1,
      date: "2027-05-10",
      city: "Tokyo",
      entries: [
        {
          type: "commitment",
          commitmentId: "f",
          commitmentKind: "TRANSPORT",
          title: "Flight in",
          start: "14:35",
          minutes: 0,
          slotId: null,
        },
        {
          type: "commitment",
          commitmentId: "m",
          commitmentKind: "MUST_SEE",
          title: "teamLab",
          start: null,
          minutes: null,
          slotId: "d1-afternoon",
        },
        {
          type: "place",
          slotId: "d1-afternoon-2",
          kind: "afternoon-2",
          cityKey: "tokyo|japan",
          placeId: "p1",
          start: "16:00",
          minutes: 120,
          minutesEstimated: true,
          travelIn: { means: "walk", minutes: 12 },
          flags: [
            {
              rule: "hours-unknown",
              message: "Opening hours are not known. Check before you go.",
              fix: null,
            },
          ],
        },
        {
          type: "open",
          slotId: "d1-dinner",
          kind: "dinner",
          start: "19:00",
          cityKey: "tokyo|japan",
        },
      ],
    },
    {
      day: 2,
      date: "2027-05-11",
      city: "Tokyo",
      entries: [
        {
          type: "open",
          slotId: "d2-morning",
          kind: "morning",
          start: "09:30",
          cityKey: "tokyo|japan",
        },
        {
          type: "transfer",
          from: "Tokyo",
          to: "Kyoto",
          start: "12:00",
          minutes: 345,
          arriveLocal: null,
        },
        { type: "wander", start: "13:45", minutes: 60, area: "Ueno Park" },
      ],
    },
  ],
};
const handlers = {
  onFocus: vi.fn(),
  onMove: vi.fn(),
  onRemove: vi.fn(),
  onLook: vi.fn(),
  onMinutes: vi.fn(),
  onTransfer: vi.fn(),
};
const render = (readOnly = false, shown: PlanView = view) =>
  renderToStaticMarkup(
    <PlanItinerary
      view={shown}
      chosen={{ p1: card("p1", "Tokyo National Museum") }}
      focusSlotId="d1-dinner"
      transit={null}
      readOnly={readOnly}
      {...handlers}
    />,
  );

describe("PlanItinerary", () => {
  it("shows each day with its stamp, in time order", () => {
    const html = render();
    expect(html).toContain("Day 1 · Mon 10 May");
    expect(html).toContain('aria-label="Tokyo, day 1"');
    expect(html.indexOf("Flight in")).toBeLessThan(
      html.indexOf("Tokyo National Museum"),
    );
    expect(html.indexOf("Tokyo National Museum")).toBeLessThan(
      html.indexOf("Dinner"),
    );
  });

  it("shows booked items as ticket stubs with no way to move or remove them", () => {
    const html = render();
    expect(html.match(/data-qa="ticket-stub"/g)).toHaveLength(2);
    expect(html).toContain("time to be set, I plan around it");
    expect(html).not.toContain("Remove Flight in");
    expect(html).not.toContain("Move teamLab");
  });

  it("shows a place with its estimated travel and visit length, its flag, and its controls", () => {
    const html = render();
    expect(html).toContain("Walk · about 12 min (estimate)");
    expect(html).toContain("2 h (estimate)");
    expect(html).toContain(
      "Needs a look: Opening hours are not known. Check before you go.",
    );
    for (const label of [
      "Details for Tokyo National Museum",
      "Swap Tokyo National Museum",
      "Move Tokyo National Museum to…",
      "Visit length for Tokyo National Museum",
      "Remove Tokyo National Museum",
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it("marks the open slot being chosen, and offers the others", () => {
    const html = render();
    expect(html).toContain("choosing now");
    expect(html).toContain('aria-label="Choose Day 2 · 09:30 Morning"');
    expect(html).not.toContain('aria-label="Choose Day 1 · 19:00 Dinner"');
  });

  it("says when a transfer arrives by the clock there, when that clock differs", () => {
    const abroad: PlanView = {
      ...view,
      days: view.days.map((day) => ({
        ...day,
        entries: day.entries.map((entry) =>
          entry.type === "transfer"
            ? { ...entry, arriveLocal: "18:45" }
            : entry,
        ),
      })),
    };
    expect(render(false, abroad)).toContain(
      "Travel from Tokyo to Kyoto · about 6 h · assumed, not booked · you arrive about 18:45, Kyoto time",
    );
    expect(render()).not.toContain("you arrive about");
  });

  it("shows an assumed transfer as not booked, time to wander, and what is still to fit in", () => {
    const html = render();
    expect(html).toContain(
      "Travel from Tokyo to Kyoto · about 6 h · assumed, not booked",
    );
    expect(html).toContain("Time to wander around Ueno Park · 60 min");
    expect(html).toContain("Still to fit in");
    expect(html).toContain("Skytree");
  });

  it("offers no changes when the trip is archived", () => {
    const html = render(true);
    expect(html).toContain("Details for Tokyo National Museum");
    for (const gone of [
      "Swap Tokyo",
      "Remove Tokyo",
      "Move Tokyo",
      ">Choose<",
      "Leave at",
    ]) {
      expect(html, gone).not.toContain(gone);
    }
  });
});

describe("slot labels and options", () => {
  it("names a slot by day, time and part of the day", () => {
    expect(
      slotLabel(2, {
        type: "open",
        slotId: "d2-morning",
        kind: "morning",
        start: "09:30",
        cityKey: "x",
      }),
    ).toBe("Day 2 · 09:30 Morning");
  });

  it("lists every slot a place could go into, never one that is already decided", () => {
    expect(slotOptions(view).map((option) => option.value)).toEqual([
      "d1-afternoon-2",
      "d1-dinner",
      "d2-morning",
    ]);
    expect(
      slotOptions(view, "d1-dinner").map((option) => option.value),
    ).toEqual(["d1-afternoon-2", "d2-morning"]);
  });
});

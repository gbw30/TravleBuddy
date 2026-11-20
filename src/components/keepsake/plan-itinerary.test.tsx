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
  links: null,
  hoursDoubt: null,
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
      stayNote: null,
      entries: [
        {
          type: "commitment",
          commitmentId: "f",
          commitmentKind: "TRANSPORT",
          title: "Flight in",
          start: "14:35",
          minutes: 0,
          slotId: null,
          ticket: null,
        },
        {
          type: "commitment",
          commitmentId: "m",
          commitmentKind: "MUST_SEE",
          title: "teamLab",
          start: null,
          minutes: null,
          slotId: "d1-afternoon",
          ticket: null,
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
      stayNote: null,
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

  it("reads a ticket by the clock of each end, or says its length is unknown", () => {
    const flight = (minutes: number | null): PlanView => ({
      ...view,
      days: [
        {
          ...view.days[0],
          entries: [
            {
              type: "commitment",
              commitmentId: "f",
              commitmentKind: "TRANSPORT",
              title: "Flight",
              start: "10:00",
              minutes,
              slotId: null,
              ticket: { from: "London", to: "Rome", arrives: "13:00" },
            },
          ],
        },
      ],
    });
    expect(render(false, flight(120))).toContain(
      "Leaves 10:00 London time · arrives 13:00 Rome time · 2 h",
    );
    expect(render(false, flight(null))).toContain(
      "arrives 13:00 Rome time · length unknown",
    );
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

  it("shows the time allowed at an airport, station or port, with a quiet doubt line", () => {
    const allowed = (
      way: "to" | "from",
      mode: string | null,
      start: string,
      minutes: number,
    ): PlanView => ({
      ...view,
      days: [
        {
          ...view.days[0],
          entries: [{ type: "allowance", way, mode, start, minutes }],
        },
      ],
    });
    const none = [
      render(false, allowed("from", null, "14:35", 60)),
      render(false, allowed("to", null, "15:40", 120)),
    ];
    expect(none[0]).toContain("After you arrive, about 1 h allowed");
    expect(none[1]).toContain("Before you leave, 2 h allowed, from 15:40");
    for (const html of none) {
      expect(html).toContain("Check the transfer time for this journey");
      expect(html).toContain("font-sans text-[13px] leading-6 text-muted");
      expect(html).not.toMatch(/airport|station|port\b/);
    }
    const from = render(false, allowed("from", "FLIGHT", "14:35", 60));
    expect(from).toContain("From the airport, about 1 h allowed");
    expect(from).toContain("Check the transfer time for your airport");
    expect(from).toContain("font-sans text-[13px] leading-6 text-muted");
    const to = render(false, allowed("to", "FLIGHT", "15:40", 120));
    expect(to).toContain(
      "To the airport and check-in, 2 h allowed, from 15:40",
    );
    const train = render(false, allowed("to", "TRAIN", "08:30", 30));
    expect(train).toContain(
      "To the station and check-in, 30 min allowed, from 08:30",
    );
    expect(train).toContain("Check the transfer time for your station");
    expect(render(false, allowed("from", "BUS", "11:00", 20))).toContain(
      "From the station, about 20 min allowed",
    );
    expect(render(false, allowed("from", "FERRY", "11:00", 20))).toContain(
      "Check the transfer time for your port",
    );
    for (const html of [from, to, train]) {
      expect(html).not.toMatch(/travel|min \(estimate\)/i);
    }
  });

  it("shows the way back to the stay, travel to a check-in, and the quiet note", () => {
    const html = render(false, {
      ...view,
      days: [
        {
          ...view.days[0],
          stayNote: "Travel from where you stay is not counted.",
          entries: [
            {
              type: "commitment",
              commitmentId: "s",
              commitmentKind: "STAY",
              title: "Check in at Hotel Aurora",
              start: "15:00",
              minutes: 30,
              slotId: null,
              ticket: null,
              travelIn: { means: "transit", minutes: 21 },
            },
            {
              type: "return",
              stay: "Hotel Aurora",
              start: "19:30",
              travel: { means: "walk", minutes: 12 },
            },
          ],
        },
      ],
    });
    expect(html).toContain("Check in at Hotel Aurora");
    expect(html).toContain("Transit · about 21 min (estimate)");
    expect(html).toContain(
      "Back to Hotel Aurora · Walk · about 12 min (estimate)",
    );
    expect(html).toContain("Travel from where you stay is not counted.");
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

import { describe, expect, it } from "vitest";

import type { PlaceDto } from "@/features/places/contracts";

import { discardReason, DISCARD_REASONS } from "./contracts";
import { noHistory, proposeCards, toCard, type ProposeInput } from "./propose";

const place = (id: string, over: Partial<PlaceDto> = {}): PlaceDto => ({
  id,
  origin: "OSM",
  name: id,
  kind: "museum",
  cityKey: "tokyo|japan",
  latitude: 35.7188,
  longitude: 139.7765,
  address: null,
  openingHours: "Mo-Su 09:00-18:00",
  notable: false,
  ...over,
});
// Distances from Senso-ji: near about 0.4 km, mid about 1.4 km, far about 9 km.
const sensoji = { name: "Senso-ji", latitude: 35.7148, longitude: 139.7967 };
const near = { latitude: 35.7112, longitude: 139.7965 };
const mid = { latitude: 35.7101, longitude: 139.8107 };
const far = { latitude: 35.6585, longitude: 139.7022 };

// 11 May 2027 is a Tuesday.
const input = (over: Partial<ProposeInput> = {}): ProposeInput => ({
  slot: {
    id: "d2-morning",
    kind: "morning",
    date: "2027-05-11",
    start: "09:30",
  },
  cityName: "Tokyo",
  from: null,
  candidates: [],
  taken: [],
  kindsInDay: [],
  history: noHistory,
  ...over,
});
const ids = (set: ReturnType<typeof proposeCards>) =>
  set.cards.map((card) => card.placeId);

describe("proposeCards", () => {
  it("offers three cards, best first, and the same three every time", () => {
    const candidates = ["e", "c", "a", "d", "b"].map((id) =>
      place(id, { notable: id === "d" }),
    );
    const first = proposeCards(input({ candidates }));
    expect(ids(first)).toEqual(["d", "a", "b"]);
    expect(first.short).toBe(false);
    expect(
      proposeCards(input({ candidates: [...candidates].reverse() })),
    ).toEqual(first);
  });

  it("shows fewer than three when fewer fit, and never pads the set", () => {
    const set = proposeCards(input({ candidates: [place("a"), place("b")] }));
    expect(ids(set)).toEqual(["a", "b"]);
    expect(set.short).toBe(true);
    expect(proposeCards(input()).cards).toEqual([]);
  });

  it("never offers a place that is closed for the visit, and says when hours are unknown", () => {
    const set = proposeCards(
      input({
        candidates: [
          place("closed", { openingHours: "Tu off; We-Mo 09:00-18:00" }),
          place("short", { openingHours: "Mo-Su 09:00-11:00" }),
          place("unknown", { openingHours: null }),
          place("open"),
        ],
      }),
    );
    expect(ids(set)).toEqual(["open", "unknown"]);
    expect(set.cards[0].reason).toContain("open for the whole visit");
    expect(set.cards[1].reason).toContain("opening hours are not known");
    expect(set.cards[1].hours).toBeNull();
  });

  it("leaves out places already in the plan, on the shelf, or turned down on this trip", () => {
    const set = proposeCards(
      input({
        candidates: ["a", "b", "c", "d"].map((id) => place(id)),
        taken: ["a"],
        history: { ...noHistory, discarded: ["b"] },
      }),
    );
    expect(ids(set)).toEqual(["c", "d"]);
  });

  it("prefers the nearer place, and gives the estimated travel from the stop before", () => {
    const set = proposeCards(
      input({
        from: sensoji,
        candidates: [place("far", far), place("near", near), place("mid", mid)],
      }),
    );
    expect(ids(set)).toEqual(["near", "mid", "far"]);
    expect(set.cards[0].travel).toMatchObject({ means: "walk" });
    expect(set.cards[0].essentials).toMatch(/^Museum · \d+ min walk$/);
    expect(set.cards[0].reason).toMatch(
      /minute walk from Senso-ji, so it fits your morning/,
    );
  });

  it("lets a well-known place win over a slightly nearer one, until the traveller says too touristy", () => {
    const candidates = [
      place("quiet", near),
      place("famous", { ...mid, notable: true }),
    ];
    expect(ids(proposeCards(input({ from: sensoji, candidates })))).toEqual([
      "famous",
      "quiet",
    ]);

    const after = proposeCards(
      input({
        from: sensoji,
        candidates,
        history: { ...noHistory, lessTouristy: 1 },
      }),
    );
    expect(ids(after)).toEqual(["quiet", "famous"]);
    expect(after.cards[0].reason).toContain("less touristy");
  });

  it("looks closer after too far, and says that is why", () => {
    const candidates = [
      place("famous", { ...far, notable: true }),
      place("near", near),
    ];
    const before = proposeCards(input({ from: sensoji, candidates }));
    const after = proposeCards(
      input({
        from: sensoji,
        candidates,
        history: { ...noHistory, tooFar: 2 },
      }),
    );
    expect(ids(after)).toEqual(["near", "famous"]);
    expect(after.cards[0].reason).toContain("too far, so I looked closer");
    expect(
      before.cards.find((card) => card.placeId === "near")!.reason,
    ).not.toContain("too far");
  });

  it("varies the kinds in a day and steps back from a kind turned down as not my taste", () => {
    const candidates = [place("museum"), place("park", { kind: "park" })];
    expect(
      ids(proposeCards(input({ candidates, kindsInDay: ["museum"] }))),
    ).toEqual(["park", "museum"]);
    expect(
      ids(
        proposeCards(
          input({
            candidates,
            history: { ...noHistory, dislikedKinds: ["museum"] },
          }),
        ),
      ),
    ).toEqual(["park", "museum"]);
    expect(
      proposeCards(input({ candidates, kindsInDay: ["museum"] })).cards[0]
        .reason,
    ).toContain("no park or garden in this day yet");
  });

  it("gives every card a reason of one to three sentences that names the slot", () => {
    const set = proposeCards(
      input({
        from: sensoji,
        candidates: [
          place("a", near),
          place("b", { ...mid, notable: true }),
          place("c", { openingHours: null }),
        ],
        history: { ...noHistory, tooFar: 1 },
      }),
    );
    for (const card of set.cards) {
      const sentences = card.reason.split(/(?<=\.)\s/).length;
      expect(sentences, card.reason).toBeGreaterThanOrEqual(1);
      expect(sentences, card.reason).toBeLessThanOrEqual(3);
      expect(card.reason).toContain("morning");
    }
  });
});

describe("a card's facts", () => {
  it("come from the saved place and say when something is unknown", () => {
    const card = toCard(
      place("Nezu Shrine", {
        kind: "temple",
        openingHours: null,
        address: null,
      }),
      "Tokyo",
      "You chose this for day 2.",
    );
    expect(card).toEqual({
      placeId: "Nezu Shrine",
      name: "Nezu Shrine",
      origin: "OSM",
      kind: "temple",
      essentials: "Shrine or temple",
      summary: "Shrine or temple in Tokyo. Opening hours unknown.",
      reason: "You chose this for day 2.",
      address: null,
      hours: null,
      visitMinutes: 45,
      travel: null,
    });
  });

  it("marks sample data and a traveller's own place as such", () => {
    expect(
      toCard(place("a", { origin: "SAMPLE" }), "Tokyo", "r").summary,
    ).toContain("Sample data");
    expect(
      toCard(place("a", { origin: "USER" }), "Tokyo", "r").summary,
    ).toContain("Added by you");
  });
});

describe("discard reasons", () => {
  it("are the eight common ones, found by key or by label", () => {
    expect(DISCARD_REASONS).toHaveLength(8);
    expect(discardReason("Too far")).toBe("too_far");
    expect(discardReason("too_touristy")).toBe("too_touristy");
    expect(discardReason("Because")).toBeNull();
  });
});

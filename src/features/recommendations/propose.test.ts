import { describe, expect, it } from "vitest";

import type { PlaceDto } from "@/features/places/contracts";

import { fill } from "@/lib/wording";

import { discardReason, DISCARD_REASONS } from "./contracts";
import {
  INTEREST_KINDS,
  noHistory,
  noTaste,
  proposeCards,
  toCard,
  type CardTaste,
  type ProposeInput,
} from "./propose";

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
  serves: [],
  servesNot: [],
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
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
  taste: noTaste,
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
    expect(set.cards[0].reason).toContain("listed hours cover the whole visit");
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
    expect(set.cards[0].essentials).toMatch(/^Museum · about \d+ min walk$/);
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
    expect(after.cards[0].reason).toContain("too far");
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

describe("a place that would break a rule of the plan", () => {
  it("is not offered: the three best that fit are", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((id) => place(id));
    const all = ids(proposeCards(input({ candidates })));
    expect(all).toEqual(["a", "b", "c"]);
    const tried: string[] = [];
    const set = proposeCards(
      input({
        candidates,
        fits: (item) => {
          tried.push(item.id);
          return item.id !== "a" && item.id !== "c";
        },
      }),
    );
    expect(ids(set)).toEqual(["b", "d", "e"]);
    // Only as many are tried as it takes.
    expect(tried).toEqual(["a", "b", "c", "d", "e"]);
    expect(
      proposeCards(input({ candidates, fits: () => false })),
    ).toMatchObject({
      cards: [],
      short: true,
      close: false,
    });
  });

  it("stops trying once three fit", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((id) => place(id));
    const tried: string[] = [];
    proposeCards(
      input({
        candidates,
        fits: (item) => {
          tried.push(item.id);
          return true;
        },
      }),
    );
    expect(tried).toEqual(["a", "b", "c"]);
  });
});

describe("a name already in the plan", () => {
  it("ranks below a place the traveller has not been to, and is still offered", () => {
    const candidates = [place("a", { name: "Market Kitchen" }), place("b")];
    expect(ids(proposeCards(input({ candidates })))).toEqual(["a", "b"]);
    expect(
      ids(proposeCards(input({ candidates, namesInPlan: ["market kitchen"] }))),
    ).toEqual(["b", "a"]);
  });

  it("still ranks above a new place when only it confirms the traveller's dietary rule", () => {
    const set = proposeCards(
      input({
        slot: {
          ...input().slot,
          id: "d1-lunch",
          kind: "lunch",
          start: "12:30",
        },
        candidates: [
          place("known", {
            kind: "restaurant",
            name: "Market Kitchen",
            serves: ["vegetarian"],
          }),
          place("new", { kind: "restaurant", name: "Garden Table" }),
        ],
        namesInPlan: ["Market Kitchen"],
        taste: { ...input().taste, food: ["vegetarian"] },
      }),
    );
    expect(ids(set)).toEqual(["known", "new"]);
  });
});

describe("a close choice", () => {
  it("is marked when the second place ranks nearly as high as the first", () => {
    // Two places alike in every way that counts.
    expect(
      proposeCards(input({ candidates: [place("a"), place("b")] })).close,
    ).toBe(true);
    // A place that answers an interest stands clear of one that does not.
    const set = proposeCards(
      input({
        candidates: [
          place("a", { kind: "museum" }),
          place("b", { kind: "park" }),
        ],
        taste: {
          ...input().taste,
          interests: [{ value: "museums", label: "museums and exhibitions" }],
        },
      }),
    );
    expect(set.cards[0].placeId).toBe("a");
    expect(set.close).toBe(false);
  });

  it("is not marked with one place or none", () => {
    expect(proposeCards(input({ candidates: [place("a")] })).close).toBe(false);
    expect(proposeCards(input()).close).toBe(false);
  });
});

describe("the traveller's taste in the ranking", () => {
  const taste = (over: Partial<CardTaste>): CardTaste => ({
    ...noTaste,
    ...over,
  });
  const museums = { value: "museums", label: "museums and exhibitions" };
  const reasonOf = (set: ReturnType<typeof proposeCards>, id: string) =>
    set.cards.find((card) => card.placeId === id)!.reason;

  it("puts a place that answers a named interest first, and says which interest", () => {
    const candidates = [
      place("a-park", { kind: "park" }),
      place("b-market", { kind: "market" }),
      place("z-museum", { kind: "museum" }),
    ];
    expect(ids(proposeCards(input({ candidates })))[0]).toBe("a-park");
    const set = proposeCards(
      input({ candidates, taste: taste({ interests: [museums] }) }),
    );
    expect(ids(set)[0]).toBe("z-museum");
    expect(reasonOf(set, "z-museum")).toBe(
      "It fits your morning in Tokyo. You said you like museums and exhibitions. Its listed hours cover the whole visit.",
    );
    expect(reasonOf(set, "a-park")).toContain(
      "It is not one of the interests you named.",
    );
  });

  it("names the trip a memory comes from, and not when it was said for this trip", () => {
    const remembered = { ...museums, from: "Tokyo in May" };
    const candidates = [
      place("z-museum", { kind: "museum" }),
      place("famous", { ...mid, kind: "park", notable: true }),
      place("close", { ...near, kind: "market" }),
    ];
    const set = proposeCards(
      input({
        from: sensoji,
        candidates,
        taste: taste({
          interests: [remembered],
          atmosphere: "lively",
          onFoot: true,
          rememberedFrom: { atmosphere: "Lisbon", onFoot: "Lisbon" },
        }),
      }),
    );
    expect(reasonOf(set, "z-museum")).toContain(
      "I remember from your trip “Tokyo in May” that you like museums and exhibitions.",
    );
    expect(reasonOf(set, "famous")).toContain(
      "I remember from your trip “Lisbon” that you like lively places, and it has a Wikipedia or Wikidata entry.",
    );
    expect(reasonOf(set, "close")).toContain(
      "I remember from your trip “Lisbon” that you like to get around on foot, and this is a walk away.",
    );
    // Said for this trip: no trip is named.
    const now = proposeCards(
      input({ candidates, taste: taste({ interests: [museums] }) }),
    );
    expect(reasonOf(now, "z-museum")).toContain(
      "You said you like museums and exhibitions.",
    );
  });

  it("knows the kinds of place every interest in the script means", async () => {
    const { QUESTIONS } = await import("@/features/conversation");
    for (const choice of QUESTIONS.interests.choices) {
      expect(
        INTEREST_KINDS[choice.value]?.length,
        choice.value,
      ).toBeGreaterThan(0);
    }
  });

  it("weighs a well-known place up for lively and down for quiet, and says why", () => {
    const candidates = [
      place("famous", { ...mid, notable: true }),
      place("tucked-away", near),
    ];
    const lively = proposeCards(
      input({
        from: sensoji,
        candidates,
        taste: taste({ atmosphere: "lively" }),
      }),
    );
    expect(ids(lively)[0]).toBe("famous");
    expect(reasonOf(lively, "famous")).toContain(
      "You like lively places, and it has a Wikipedia or Wikidata entry.",
    );
    const quiet = proposeCards(
      input({
        from: sensoji,
        candidates,
        taste: taste({ atmosphere: "quiet" }),
      }),
    );
    expect(ids(quiet)[0]).toBe("tucked-away");
    expect(reasonOf(quiet, "tucked-away")).toContain(
      "You asked for quiet places, and it has no Wikipedia or Wikidata entry.",
    );
  });

  it("looks closer for a traveller who likes to walk", () => {
    // About 2 km from Senso-ji: a well-known place wins from there, but not
    // for someone on foot.
    const twoKm = { latitude: 35.7148, longitude: 139.8188 };
    const candidates = [
      place("famous", { ...twoKm, notable: true }),
      place("close", near),
    ];
    expect(ids(proposeCards(input({ from: sensoji, candidates })))[0]).toBe(
      "famous",
    );
    const onFoot = proposeCards(
      input({ from: sensoji, candidates, taste: taste({ onFoot: true }) }),
    );
    expect(ids(onFoot)[0]).toBe("close");
    expect(reasonOf(onFoot, "close")).toContain(
      "You like to get around on foot, and this is a walk away.",
    );
  });

  it("names a food rule on every meal card and says the data cannot confirm it", () => {
    const lunch = {
      id: "d2-lunch",
      kind: "lunch" as const,
      date: "2027-05-11",
      start: "12:30",
    };
    const candidates = [
      place("soba", { kind: "restaurant" }),
      place("cafe", { kind: "cafe" }),
    ];
    const ruled = proposeCards(
      input({
        slot: lunch,
        candidates,
        taste: taste({ food: ["vegetarian", "gluten-free"] }),
      }),
    );
    for (const card of ruled.cards) {
      expect(card.reason).toBe(
        "It fits your lunch in Tokyo. You eat vegetarian and gluten-free food, and the place data does not say whether this place serves it, so check with the venue. Its listed hours cover the whole visit.",
      );
    }
    const free = proposeCards(
      input({ slot: lunch, candidates, taste: taste({ food: [] }) }),
    );
    expect(free.cards[0].reason).toContain("You have no food rules.");
    expect(
      proposeCards(input({ slot: lunch, candidates })).cards[0].reason,
    ).toContain("You have not told me about food yet.");
  });

  describe("hard limits on a place to eat", () => {
    const lunch = {
      id: "d2-lunch",
      kind: "lunch" as const,
      date: "2027-05-11",
      start: "12:30",
    };
    const eat = (id: string, over: Partial<PlaceDto> = {}) =>
      place(id, { kind: "restaurant", ...over });
    const candidates = [
      eat("a-says-nothing"),
      eat("b-grill", { servesNot: ["vegetarian"] }),
      eat("c-green", { serves: ["vegetarian", "vegan"] }),
      eat("d-partly", { serves: ["vegetarian"], servesNot: ["vegan"] }),
    ];
    const propose = (over: Partial<CardTaste>, slot = lunch) =>
      proposeCards(input({ slot, candidates, taste: taste(over) }));

    it("never proposes a place whose listing says it does not serve a rule", () => {
      expect(ids(propose({ food: ["vegetarian"] }))).toEqual([
        "c-green",
        "d-partly",
        "a-says-nothing",
      ]);
      // With two rules, breaking either one is enough.
      expect(ids(propose({ food: ["vegetarian", "vegan"] }))).toEqual([
        "c-green",
        "a-says-nothing",
      ]);
      // No rule: every place is offered.
      expect(ids(propose({ food: [] }))).toHaveLength(3);
      expect(ids(propose({ food: [] }))).toContain("b-grill");
    });

    it("puts a place whose listing confirms the rules first, and says the listing says so", () => {
      const set = propose({ food: ["vegetarian"] });
      const confirmed = set.cards[0];
      expect(confirmed.reason).toContain(
        "You eat vegetarian food, and its listing says it has vegetarian options.",
      );
      expect(confirmed.unconfirmed).toBeUndefined();
      expect(confirmed.essentials).toBe("Restaurant");
    });

    it("marks a place whose listing cannot confirm a rule, on the front of the card", () => {
      const card = propose({ food: ["vegetarian"] }).cards[2];
      expect(card.placeId).toBe("a-says-nothing");
      expect(card.unconfirmed).toEqual(["vegetarian"]);
      expect(card.essentials).toBe("Restaurant · not confirmed: vegetarian");
      expect(card.reason).toContain(
        "the place data does not say whether this place serves it, so check with the venue",
      );
      // One rule confirmed, another not: only the unconfirmed one is marked.
      const both = propose({ food: ["vegetarian", "gluten-free"] });
      expect(
        both.cards.find((item) => item.placeId === "c-green")?.unconfirmed,
      ).toEqual(["gluten-free"]);
    });

    it("never calls a place safe for an allergy, whatever its listing says", () => {
      const set = propose({ food: ["vegetarian"], allergies: ["shellfish"] });
      for (const card of set.cards) {
        expect(card.unconfirmed).toContain("shellfish allergy");
        expect(card.reason).toContain("check with the venue");
        // "Safe" appears only where the card says it cannot tell.
        expect(
          card.reason.replace(/cannot tell whether (it|a place) is safe/g, ""),
        ).not.toContain("safe");
      }
      expect(set.cards[0].reason).toContain(
        "Its listing says it has vegetarian options, but place data cannot tell whether it is safe for your shellfish allergy, so check with the venue.",
      );
      expect(set.cards[2].reason).toContain(
        "You eat vegetarian food and have a shellfish allergy, and the place data confirms neither, so check with the venue.",
      );
      const only = propose({ food: [], allergies: ["shellfish", "peanut"] });
      expect(only.cards[0].reason).toContain(
        "You have a shellfish and peanut allergy, and place data cannot tell whether a place is safe for it, so check with the venue.",
      );
      expect(only.cards[0].essentials).toBe(
        "Restaurant · not confirmed: shellfish allergy, peanut allergy",
      );
    });

    it("leaves sights alone: the limits are about places to eat", () => {
      const sights = [place("museum", { servesNot: ["vegetarian"] })];
      const set = proposeCards(
        input({
          candidates: sights,
          taste: taste({ food: ["vegetarian"], allergies: ["shellfish"] }),
        }),
      );
      expect(ids(set)).toEqual(["museum"]);
      expect(set.cards[0].unconfirmed).toBeUndefined();
      expect(set.cards[0].reason).not.toContain("allergy");
    });
  });

  it("names something about the traveller and the slot in every reason, in three sentences at most", () => {
    const candidates = [
      place("a", { ...near, kind: "museum" }),
      place("b", { ...mid, kind: "park", notable: true }),
      place("c", { kind: "market", openingHours: null }),
    ];
    const tastes: CardTaste[] = [
      noTaste,
      taste({ interests: [] }),
      taste({ interests: [museums] }),
      taste({ interests: [museums], atmosphere: "quiet", onFoot: true }),
      taste({ atmosphere: "lively" }),
    ];
    for (const from of [null, sensoji]) {
      for (const given of tastes) {
        const set = proposeCards(
          input({ from, candidates, taste: given, kindsInDay: ["museum"] }),
        );
        expect(set.cards).toHaveLength(3);
        for (const card of set.cards) {
          expect(card.reason).toContain("morning");
          expect(card.reason, card.reason).toMatch(/\b[Yy]ou\b/);
          expect(
            card.reason.split(/(?<=\.)\s/).length,
            card.reason,
          ).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("says plainly when nothing is known yet, or the choice was left open", () => {
    const candidates = [place("a", { notable: true })];
    expect(proposeCards(input({ candidates })).cards[0].reason).toContain(
      "You have not told me what you like to see yet, and it has a Wikipedia or Wikidata entry.",
    );
    expect(
      proposeCards(input({ candidates, taste: taste({ interests: [] }) }))
        .cards[0].reason,
    ).toContain(
      "You left what to see open, and it has a Wikipedia or Wikidata entry.",
    );
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
      links: {
        website: null,
        maps: "https://www.google.com/maps/search/?api=1&query=Nezu%20Shrine%2C35.7188%2C139.7765",
        osm: null,
      },
      hoursDoubt: null,
    });
  });

  it("carry the place's links and hours doubt, and none for a sample", () => {
    const real = toCard(
      place("a", { hoursDoubt: "Worth a check." }),
      "Tokyo",
      "r",
    );
    expect(real.hoursDoubt).toBe("Worth a check.");
    expect(real.links).not.toBeNull();
    expect(
      toCard(place("a", { origin: "SAMPLE" }), "Tokyo", "r").links,
    ).toBeNull();
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

describe("true sentences", () => {
  const taste = (over: Partial<CardTaste>): CardTaste => ({
    ...noTaste,
    ...over,
  });
  const reasonOf = (set: ReturnType<typeof proposeCards>, id: string) =>
    set.cards.find((card) => card.placeId === id)!.reason;
  const lunch = {
    id: "d2-lunch",
    kind: "lunch" as const,
    date: "2027-05-11",
    start: "12:30",
  };

  it("uses the stated means for travel", () => {
    const set = proposeCards(
      input({
        from: sensoji,
        candidates: [place("a", near)],
        taste: taste({ means: "drive" }),
      }),
    );
    expect(set.cards[0].travel?.means).toBe("drive");
    expect(set.cards[0].essentials).toMatch(
      /^Museum · about \d+ min drive(?: · or [\d.]+ (?:m|km), about \d+ min on foot)?$/,
    );
    expect(set.cards[0].reason).toMatch(/minute drive from Senso-ji/);
  });

  it("shows the walk beside the traveller's own means on one line, for a short hop only", () => {
    const set = (to: typeof near) =>
      proposeCards(
        input({
          from: sensoji,
          candidates: [place("a", to)],
          taste: taste({ means: "transit" }),
        }),
      ).cards[0];
    expect(set(near).essentials).toMatch(
      /^Museum · about \d+ min ride · or \d+ m, about \d+ min on foot$/,
    );
    expect(set(near).travel?.walk).toBeDefined();
    expect(set(far).essentials).toMatch(/^Museum · about \d+ min ride$/);
  });

  it("says about N min on the front of the card", () => {
    const set = proposeCards(
      input({ from: sensoji, candidates: [place("a", far)] }),
    );
    expect(set.cards[0].essentials).toMatch(/^Museum · about \d+ min ride$/);
  });

  it("never says it looked closer", () => {
    const set = proposeCards(
      input({
        from: sensoji,
        candidates: [place("near", near)],
        history: { ...noHistory, tooFar: 2 },
      }),
    );
    expect(set.cards[0].reason).toContain(
      "You said the last places were too far.",
    );
    expect(set.cards[0].reason).not.toContain("looked closer");
  });

  it("says nothing of notability for a sample place", () => {
    const candidates = [
      place("a", { origin: "SAMPLE", notable: true }),
      place("b", { origin: "SAMPLE", notable: false }),
    ];
    for (const given of [
      taste({ atmosphere: "lively" }),
      taste({ atmosphere: "quiet" }),
      noTaste,
    ]) {
      for (const card of proposeCards(input({ candidates, taste: given }))
        .cards) {
        expect(card.reason).not.toMatch(
          /Wikipedia|Wikidata|well-known|quieter|touristy/,
        );
      }
    }
    // For a real place it says what the tag supports, and no more.
    const real = proposeCards(
      input({
        candidates: [place("a", { notable: true }), place("b")],
        taste: taste({ atmosphere: "lively" }),
      }),
    );
    expect(reasonOf(real, "a")).toContain(
      "it has a Wikipedia or Wikidata entry",
    );
  });

  it("says a real place's listed hours cover the visit, however old, and never doubts in a reason", () => {
    const set = proposeCards(
      input({
        candidates: [
          place("fresh"),
          place("old", {
            hoursDoubt: "Last updated on the map in 2021. Worth a check.",
          }),
          place("sample", { origin: "SAMPLE" }),
        ],
      }),
    );
    expect(reasonOf(set, "fresh")).toContain(
      "Its listed hours cover the whole visit.",
    );
    expect(reasonOf(set, "old")).toContain(
      "Its listed hours cover the whole visit.",
    );
    expect(reasonOf(set, "sample")).toContain(
      "Its sample hours cover the whole visit.",
    );
    const own = proposeCards(
      input({ candidates: [place("own", { origin: "USER" })] }),
    );
    expect(reasonOf(own, "own")).toContain("It is open for the whole visit.");
    for (const card of set.cards) {
      expect(card.reason).not.toContain("out of date");
    }
  });

  it("names the tag's own diet word", () => {
    const set = proposeCards(
      input({
        slot: lunch,
        candidates: [
          place("vegan-place", {
            kind: "restaurant",
            serves: ["vegetarian", "vegan"],
            tags: { "diet:vegan": "yes" },
          }),
        ],
        taste: taste({ food: ["vegetarian"] }),
      }),
    );
    expect(set.cards[0].reason).toContain(
      "You eat vegetarian food, and its listing says it has vegan options.",
    );
  });

  it("never says a traveller's own place has a listing, so its diet stays unconfirmed", () => {
    const own = (allergies: string[]) =>
      proposeCards(
        input({
          slot: lunch,
          candidates: [
            place("mine", {
              origin: "USER",
              kind: "restaurant",
              serves: ["vegetarian"],
            }),
          ],
          taste: taste({ food: ["vegetarian"], allergies }),
        }),
      ).cards[0].reason;
    expect(own([])).not.toMatch(/listing/i);
    expect(own([])).toContain(
      "You eat vegetarian food, and the place data does not say whether this place serves it, so check with the venue.",
    );
    expect(own(["peanut"])).not.toMatch(/listing/i);
  });

  it("says the sample data for a sample diet", () => {
    const set = proposeCards(
      input({
        slot: lunch,
        candidates: [
          place("s", {
            origin: "SAMPLE",
            kind: "restaurant",
            serves: ["vegetarian"],
          }),
        ],
        taste: taste({ food: ["vegetarian"], allergies: ["peanut"] }),
      }),
    );
    expect(set.cards[0].reason).not.toMatch(/listing/i);
    expect(set.cards[0].reason).toContain("The sample data says it serves");
    const plain = proposeCards(
      input({
        slot: lunch,
        candidates: [
          place("s", {
            origin: "SAMPLE",
            kind: "restaurant",
            serves: ["vegetarian"],
          }),
        ],
        taste: taste({ food: ["vegetarian"] }),
      }),
    );
    expect(plain.cards[0].reason).toContain(
      "You eat vegetarian food, and the sample data says it serves it.",
    );
  });
});

describe("a reason as sentences", () => {
  it("is the filled sentences, each fact with a source", () => {
    const set = proposeCards(
      input({
        from: sensoji,
        candidates: [
          place("a", { ...near, notable: true }),
          place("b", { serves: ["vegetarian"], tags: { "diet:vegan": "yes" } }),
        ],
        kindsInDay: ["temple"],
        taste: { ...noTaste, food: ["vegetarian"], allergies: ["peanut"] },
        slot: {
          id: "d2-lunch",
          kind: "lunch",
          date: "2027-05-11",
          start: "12:30",
        },
      }),
    );
    expect(set.cards.length).toBe(2);
    for (const card of set.cards) {
      const sentences = set.sentences[card.placeId];
      expect(card.reason).toBe(sentences.map(fill).join(" "));
      for (const sentence of sentences) {
        expect(sentence.version).toBe(1);
        for (const fact of sentence.facts)
          expect(fact.source.type).toBeTruthy();
      }
    }
  });
});

describe("where a reason's facts come from", () => {
  const refs = (set: ReturnType<typeof proposeCards>) =>
    Object.fromEntries(
      set.sentences.a.flatMap((s) =>
        s.facts.flatMap((f) =>
          f.source.type === "traveller" ? [[f.gap, f.source.ref]] : [],
        ),
      ),
    );

  it("cites the profile entry of an interest, and of the trip it is recalled from", () => {
    const taste: CardTaste = {
      ...noTaste,
      interests: [
        { value: "museums", label: "museums", from: "Rome", entry: "e-1" },
      ],
    };
    const set = proposeCards(input({ candidates: [place("a")], taste }));
    expect(refs(set)).toMatchObject({
      interest: "profile:e-1",
      trip: "profile:e-1",
    });
  });

  it("cites the entry of a remembered rule and an allergy, and the trip's answers for one given for the trip", () => {
    const taste: CardTaste = {
      ...noTaste,
      food: ["vegetarian", "halal"],
      allergies: ["peanut"],
      limitEntries: {
        food: { vegetarian: "e-2" },
        allergies: { peanut: "e-3" },
      },
    };
    const set = proposeCards(
      input({
        candidates: [place("a", { kind: "restaurant" })],
        taste,
        slot: {
          id: "d2-lunch",
          kind: "lunch",
          date: "2027-05-11",
          start: "12:30",
        },
      }),
    );
    expect(refs(set)).toMatchObject({
      rules: "profile:e-2,trip-taste:food",
      allergy: "profile:e-3",
    });
  });

  it("names the trip's own answers when nothing is remembered", () => {
    const taste: CardTaste = {
      ...noTaste,
      interests: [{ value: "museums", label: "museums" }],
    };
    expect(
      refs(proposeCards(input({ candidates: [place("a")], taste }))),
    ).toEqual({ interest: "trip-taste:interests" });
  });

  it("names the trip's own answers when the interests were left open", () => {
    const set = proposeCards(
      input({
        candidates: [place("a")],
        taste: { ...noTaste, interests: [] },
      }),
    );
    expect(refs(set)).toEqual({ told: "trip-taste:interests" });
  });
});

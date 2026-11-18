import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { tasteInUse } from "@/features/memory";
import type { ProfileEntry } from "@/features/memory/contracts";
import type { TripDetail, TripFacts } from "@/features/trips/contracts";
import { briefOf } from "@/use-cases/brief";

import { BriefSteps } from "./brief-steps";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const facts: TripFacts = {
  cities: [
    {
      city: {
        name: "Tokyo",
        region: null,
        country: "Japan",
        latitude: 35.6,
        longitude: 139.7,
        timeZone: "Asia/Tokyo",
      },
      nights: 4,
    },
  ],
  startDate: "2027-05-10",
  endDate: "2027-05-14",
  lengthNights: null,
  timeOfYear: null,
  datesFirmness: null,
  adults: 2,
  children: 0,
  budgetAmount: null,
  budgetCurrency: null,
  budgetBasis: null,
  budgetFirmness: null,
  purpose: "Birdwatching",
};
const personal: ProfileEntry[] = [
  {
    topic: "pace",
    value: "relaxed",
    sureness: "think",
    source: { type: "trip", tripId: "t0", tripTitle: "Lisbon, April 2027" },
  },
  {
    topic: "allergies",
    value: "shellfish",
    sureness: "always",
    source: { type: "told" },
  },
];
const brief = briefOf(
  {
    id: "trip-1",
    revision: 3,
    title: "Tokyo in May",
    archived: false,
    facts,
    commitments: [],
    clashes: [],
  } as unknown as TripDetail,
  tasteInUse(personal, {
    interests: { values: ["views"], source: "told" },
  }),
  personal,
  "Markets and views. Not too many temples. Allergic to peanuts",
);
const at = (step: number, view = brief) =>
  renderToStaticMarkup(<BriefSteps initial={view} startAt={step} />);
const pressed = (html: string) =>
  [...html.matchAll(/aria-pressed="true"[^>]*>([^<]+)</g)].map(
    (match) => match[1],
  );

describe("the trip brief on screen", () => {
  it("names the step it is on, out of five", () => {
    expect(at(0)).toContain("Step 1 of 5: Where and when");
    expect(at(4)).toContain("Step 5 of 5: Review");
  });

  it("asks where, when and who in step 1, filled in from the trip", () => {
    const html = at(0);
    for (const asks of [
      "Where are you going?",
      "When?",
      "Who is travelling?",
    ]) {
      expect(html, asks).toContain(asks);
    }
    expect(html).toContain("Tokyo");
    expect(html).toContain('value="2027-05-10"');
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Back<");
  });

  it("says nothing is wrong with an untouched step, even an empty one", () => {
    const empty = briefOf(
      {
        id: "trip-2",
        revision: 0,
        title: "New trip",
        archived: false,
        facts: {
          ...facts,
          cities: [],
          startDate: null,
          endDate: null,
          adults: null,
        },
        commitments: [],
        clashes: [],
      } as unknown as TripDetail,
      {},
      [],
    );
    expect(at(0, empty)).not.toContain("Add at least one city.");
  });

  it("lists what is already decided in step 2", () => {
    const html = at(1);
    expect(html).toContain("I plan around these and never");
    expect(html).toContain('data-qa="commitments"');
  });

  it("offers the purposes as chips in step 3, with one given in the traveller's own words", () => {
    const html = at(2);
    expect(pressed(html)).toEqual(["Birdwatching"]);
    expect(html).toContain(">Honeymoon<");
    expect(html).toContain("The budget can stretch");
    expect(html).toContain("The dates can move");
  });

  it("fills in the style from memory and says where each answer comes from", () => {
    const html = at(3);
    expect(pressed(html)).toEqual(["Relaxed", "Views"]);
    expect(html).toContain(
      "What I remember (from your trip “Lisbon, April 2027”).",
    );
    expect(html).toContain("For this trip.");
    expect(html).toContain(
      "If you leave this: I will mix lively and quiet places.",
    );
    expect(html).toContain("Allergies I respect: shellfish.");
  });

  it("shows the whole brief in sentences in step 5, each part with a way to edit it", () => {
    const html = at(4);
    expect(html).toContain("Tokyo for 4 nights.");
    expect(html).toContain("The trip is for: Birdwatching.");
    expect(html.match(/>Edit</g)).toHaveLength(4);
    expect(html).toContain('Edit<span class="sr-only"> Your style</span>');
    expect(html).toContain(">Open the trip<");
  });

  it("shows how the “anything else” box was understood, and what awaits a yes", () => {
    const html = at(4);
    expect(html).toContain("Markets and views. Not too many temples.");
    expect(html).toContain("Interests: Markets and shopping");
    expect(html).toContain("Use this");
    expect(html).toContain("In use for this trip");
    expect(html).toContain("“Not too many temples”");
    expect(html).toContain("it belongs on your profile: peanuts.");
  });
});

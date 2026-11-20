import { isValidElement, type ReactElement } from "react";
import { expect, it, vi } from "vitest";

import type { TripFacts } from "@/features/trips/contracts";

import { WhereFields, WhenFields } from "./facts-fields";
import { TripFactsForm } from "./trip-facts-form";

// No DOM library is installed, so the form is called as a function and its
// state is kept in slots that survive from one call to the next, as React's do.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], next: 0 }));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) => {
      const i = hooks.next++;
      if (!(i in hooks.slots)) hooks.slots[i] = init;
      return [
        hooks.slots[i],
        (change: unknown) => {
          hooks.slots[i] =
            typeof change === "function"
              ? (change as (current: unknown) => unknown)(hooks.slots[i])
              : change;
        },
      ];
    },
  };
});
const sent = vi.hoisted(() => [] as { facts: object }[]);
vi.mock("@/lib/trip-api", () => ({
  changeTrip: async (...args: unknown[]) => {
    sent.push(args[3] as { facts: object });
    return { ok: true, data: {}, revision: 8 };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

const kyoto = {
  city: {
    name: "Kyoto",
    region: null,
    country: "Japan",
    latitude: 35,
    longitude: 135,
    timeZone: "Asia/Tokyo",
  },
  nights: null,
};
const atPageLoad: TripFacts = {
  cities: [kyoto],
  startDate: "2027-04-01",
  endDate: "2027-04-05",
  lengthNights: null,
  timeOfYear: null,
  datesFirmness: null,
  adults: null,
  children: null,
  budgetAmount: null,
  budgetCurrency: null,
  budgetBasis: null,
  budgetFirmness: null,
  purpose: null,
};
// The conversation answered these after the page loaded.
const afterConversation: TripFacts = {
  ...atPageLoad,
  adults: 2,
  children: 1,
  datesFirmness: "FLEXIBLE",
  purpose: "Honeymoon",
};

type Props = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function find(node: unknown, type: unknown): ReactElement<Props> | null {
  if (Array.isArray(node)) {
    return node.map((child) => find(child, type)).find(Boolean) ?? null;
  }
  if (!isValidElement<Props>(node)) return null;
  return node.type === type ? node : find(node.props.children, type);
}
const render = (initial: TripFacts) => {
  hooks.next = 0;
  return TripFactsForm({
    tripId: "t",
    revision: 7,
    initial,
    readOnly: false,
  }) as ReactElement<Props>;
};
const save = (form: ReactElement<Props>) =>
  form.props.onSubmit({ preventDefault() {} });

it("a facts save leaves the answers the conversation gave alone", async () => {
  hooks.slots = [];
  sent.length = 0;
  render(atPageLoad);
  find(render(afterConversation), WhereFields)!.props.set({
    cities: [{ ...kyoto, nights: 4 }],
  });
  const form = render(afterConversation);
  // The form shows what the conversation set, and an edit on top of it.
  expect(find(form, WhereFields)!.props.facts.adults).toBe(2);
  expect(find(form, WhereFields)!.props.facts.cities[0].nights).toBe(4);
  await save(form);
  expect(sent[0].facts).toEqual({ cities: [{ ...kyoto, nights: 4 }] });
  // The edit stays shown until the page reads the trip again, then it is spent
  // and the next save sends nothing.
  expect(
    find(render(afterConversation), WhereFields)!.props.facts.cities[0].nights,
  ).toBe(4);
  const reread = { ...afterConversation, cities: [{ ...kyoto, nights: 4 }] };
  render(reread); // React renders again at once when state is set while rendering
  await save(render(reread));
  expect(sent[1].facts).toEqual({});
});

it("a changed date sends both dates, so an end before the start is refused", async () => {
  hooks.slots = [];
  sent.length = 0;
  find(render(atPageLoad), WhenFields)!.props.set({ endDate: "2027-03-01" });
  await save(render(atPageLoad));
  expect(sent[0].facts).toEqual({
    startDate: "2027-04-01",
    endDate: "2027-03-01",
  });
});

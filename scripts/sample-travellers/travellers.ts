import type { Pace } from "@/features/itinerary/contracts";
import type { TasteTopic } from "@/features/memory/contracts";
import type { CommitmentInput, TicketInput } from "@/features/trips/contracts";

// The sample travellers of PRD 18, as data. Each is planned twice:
// by Guided planning, where the traveller picks every slot from the cards
// offered, and by Quick plan, where the site builds the trip.

export type Traveller = {
  key: string;
  name: string;
  /** PRD 18's own words for the sample. */
  who: string;
  tests: string;
  /** What the personal profile holds before the trip. Empty for a first trip. */
  profile: { text: string; hard?: boolean }[];
  tickets: TicketInput[];
  cities: { name: string; nights: number | null }[];
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  budget?: {
    amount: number;
    currency: "JPY" | "EUR" | "USD";
    basis: "TRIP" | "DAY";
  };
  purpose?: string;
  commitments: CommitmentInput[];
  /** What the traveller says about taste for this trip. */
  answers: Partial<Record<TasteTopic, string[]>>;
  /** Why the trip differs from their usual, when the agent asks. */
  different?: string;
  /** Sam fills in only the first step of the brief. */
  onlyStepOne?: boolean;
  /** Which of the three cards the traveller takes in Guided planning. */
  picks: "first" | "middle" | "last";
  expected: {
    pace: Pace;
    dietaryRules: string[];
    breakfast?: "included" | "suggest" | "none";
    /** The real length of each ticket, in the order they are flown. */
    ticketMinutes?: number[];
  };
};

const reservation = (
  title: string,
  date: string,
  startTime: string,
  endTime: string,
): CommitmentInput =>
  ({ kind: "RESERVATION", title, date, startTime, endTime }) as CommitmentInput;

export const TRAVELLERS: Traveller[] = [
  {
    key: "maya",
    name: "Maya",
    who: "Alone, six days in Tokyo, mid budget, vegetarian, slow pace, food-led.",
    tests: "A hard limit, pace, and a first trip with no memory.",
    profile: [],
    tickets: [],
    cities: [{ name: "Tokyo", nights: null }],
    startDate: "2027-05-10",
    endDate: "2027-05-15",
    adults: 1,
    children: 0,
    budget: { amount: 15000, currency: "JPY", basis: "DAY" },
    commitments: [
      reservation("teamLab Planets", "2027-05-12", "15:00", "17:00"),
    ],
    answers: {
      pace: ["relaxed"],
      food: ["vegetarian"],
      breakfast: ["suggest"],
      interests: ["markets"],
    },
    picks: "last",
    expected: {
      pace: "relaxed",
      dietaryRules: ["vegetarian"],
      breakfast: "suggest",
    },
  },
  {
    key: "okafors",
    name: "The Okafors",
    who: "Two adults and children of 7 and 11, five days in Lisbon, flights booked, early dinners.",
    tests: "Tickets, a party with children, day shape.",
    profile: [],
    tickets: [
      {
        mode: "FLIGHT",
        from: "London",
        to: "Lisbon",
        departDate: "2027-07-10",
        departTime: "08:20",
        arriveDate: "2027-07-10",
        arriveTime: "11:05",
        reference: "TP1351",
      },
      {
        mode: "FLIGHT",
        from: "Lisbon",
        to: "London",
        departDate: "2027-07-14",
        departTime: "17:40",
        arriveDate: "2027-07-14",
        arriveTime: "20:25",
        reference: "TP1366",
      },
    ] as TicketInput[],
    cities: [{ name: "Lisbon", nights: null }],
    startDate: "2027-07-10",
    endDate: "2027-07-14",
    adults: 2,
    children: 2,
    commitments: [],
    answers: {
      day_shape: ["early"],
      breakfast: ["included"],
      interests: ["nature", "activities"],
    },
    picks: "first",
    expected: {
      pace: "balanced",
      dietaryRules: [],
      breakfast: "included",
      ticketMinutes: [165, 165],
    },
  },
  {
    key: "dan-priya",
    name: "Dan and Priya",
    who: "Honeymoon, nine days by train through Rome, Florence and Venice, high budget, unlike Dan's profile.",
    tests: "Several cities, a trip that differs from the profile.",
    profile: [{ text: "Packed" }, { text: "Activities" }],
    tickets: [],
    cities: [
      { name: "Rome", nights: 3 },
      { name: "Florence", nights: 3 },
      { name: "Venice", nights: 2 },
    ],
    startDate: "2027-06-05",
    endDate: "2027-06-13",
    adults: 2,
    children: 0,
    budget: { amount: 6000, currency: "EUR", basis: "TRIP" },
    purpose: "Honeymoon",
    commitments: [
      reservation("Uffizi Gallery tickets", "2027-06-09", "10:00", "12:00"),
    ],
    answers: {
      pace: ["relaxed"],
      interests: ["views", "history"],
      atmosphere: ["quiet"],
    },
    different: "Honeymoon",
    picks: "middle",
    expected: { pace: "relaxed", dietaryRules: [] },
  },
  {
    key: "sam",
    name: "Sam",
    who: "Returning user, three-day city break, Quick plan with only step 1 filled.",
    tests: "Memory, defaults, and the report of assumptions.",
    profile: [{ text: "Packed" }, { text: "Museums and exhibitions" }],
    tickets: [],
    cities: [{ name: "Rome", nights: null }],
    startDate: "2027-09-10",
    endDate: "2027-09-12",
    adults: 1,
    children: 0,
    commitments: [],
    answers: {},
    onlyStepOne: true,
    picks: "first",
    expected: { pace: "packed", dietaryRules: [] },
  },
  {
    key: "lena",
    name: "Lena",
    who: "Alone, four nights in Rome, a same-day flight there and back from London, public transport, breakfast suggested.",
    tests: "A ticket that crosses a time zone, and breakfast.",
    profile: [],
    tickets: [
      {
        mode: "FLIGHT",
        from: "London",
        to: "Rome",
        departDate: "2027-06-18",
        departTime: "10:00",
        arriveDate: "2027-06-18",
        arriveTime: "13:00",
        reference: "BA546",
      },
      {
        mode: "FLIGHT",
        from: "Rome",
        to: "London",
        departDate: "2027-06-22",
        departTime: "18:00",
        arriveDate: "2027-06-22",
        arriveTime: "19:00",
        reference: "BA547",
      },
    ] as TicketInput[],
    cities: [{ name: "Rome", nights: null }],
    startDate: "2027-06-18",
    endDate: "2027-06-22",
    adults: 1,
    children: 0,
    commitments: [],
    answers: { getting_around: ["transit"], breakfast: ["suggest"] },
    picks: "first",
    expected: {
      pace: "balanced",
      dietaryRules: [],
      breakfast: "suggest",
      ticketMinutes: [120, 120],
    },
  },
];

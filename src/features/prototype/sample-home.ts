export type HomeTrip = {
  id: string;
  title: string;
  dates: string;
  state: "planning" | "upcoming" | "past";
  progress: string | null;
  photo: string;
  photoCredit: string;
  /** Stamp shown on a finished trip. */
  stamp: string | null;
};

export const homeTrips: HomeTrip[] = [
  {
    id: "tokyo",
    title: "Three slow days in Tokyo",
    dates: "10–12 May 2027",
    state: "planning",
    progress: "5 of 11 slots still open",
    photo: "/prototype/photos/yanaka-ginza.jpg",
    photoCredit: "Yoshikazu Takada, CC BY 2.0",
    stamp: null,
  },
  {
    id: "lisbon",
    title: "Lisbon with the family",
    dates: "2–7 August 2027",
    state: "upcoming",
    progress: null,
    photo: "/prototype/photos/alfama-tram.jpg",
    photoCredit: "Sonse, CC BY 2.0",
    stamp: null,
  },
  {
    id: "kyoto",
    title: "Kyoto in autumn",
    dates: "3–8 November 2026",
    state: "past",
    progress: null,
    photo: "/prototype/photos/fushimi-inari.jpg",
    photoCredit: "Basile Morin, CC BY-SA 4.0",
    stamp: "KYOTO · 2026",
  },
];

export type ProfileTopic =
  | "pace"
  | "day shape"
  | "interests"
  | "atmosphere"
  | "food"
  | "budget"
  | "getting around"
  | "stay";

export const profileTopics: ProfileTopic[] = [
  "pace",
  "day shape",
  "interests",
  "atmosphere",
  "food",
  "budget",
  "getting around",
  "stay",
];

export type ProfileEntry = {
  topic: ProfileTopic;
  value: string;
  kind: "hard limit" | "taste";
  sureness: "I think" | "usually" | "always";
  source: string;
  /** For a hard limit: what the agent does about it. */
  detail?: string;
  /**
   * A habit that is a point on a scale. `say` holds "{stop}" for the chosen
   * stop. With `yen`, the stops are amounts of money and `stops` is how they
   * read in yen.
   */
  scale?: { stops: string[]; index: number; say: string; yen?: number[] };
};

export const profileEntries: ProfileEntry[] = [
  {
    topic: "food",
    value: "Vegetarian",
    kind: "hard limit",
    sureness: "always",
    source: "you told me",
    detail:
      "Every meal I suggest has proper vegetarian choices, not one side dish.",
  },
  {
    topic: "food",
    value: "No shellfish (allergy)",
    kind: "hard limit",
    sureness: "always",
    source: "you told me",
    detail: "I check menus and skip places where it is hard to avoid.",
  },
  {
    topic: "pace",
    value: "relaxed",
    kind: "taste",
    sureness: "usually",
    source: "from your Kyoto trip",
    scale: {
      stops: ["Packed", "Balanced", "Relaxed"],
      index: 2,
      say: "A {stop} pace",
    },
  },
  {
    topic: "day shape",
    value: "Late starts, around 10:00",
    kind: "taste",
    sureness: "I think",
    source: "from your Kyoto trip",
    scale: {
      stops: ["7:00", "8:00", "9:00", "10:00", "11:00", "12:00"],
      index: 3,
      say: "Days start around {stop}",
    },
  },
  {
    topic: "interests",
    value: "Museums and gardens over shopping",
    kind: "taste",
    sureness: "usually",
    source: "from your Kyoto trip",
  },
  {
    topic: "atmosphere",
    value: "Quiet places",
    kind: "taste",
    sureness: "usually",
    source: "from your Kyoto trip",
  },
  {
    topic: "budget",
    value: "About ¥15,000 a day",
    kind: "taste",
    sureness: "I think",
    source: "from your Kyoto trip",
    scale: {
      stops: ["¥8,000", "¥15,000", "¥25,000"],
      yen: [8000, 15000, 25000],
      index: 1,
      say: "About {stop} a day",
    },
  },
  {
    topic: "getting around",
    value: "Trains and walking",
    kind: "taste",
    sureness: "always",
    source: "you told me",
  },
  {
    topic: "stay",
    value: "Small hotels in residential areas",
    kind: "taste",
    sureness: "I think",
    source: "from your Kyoto trip",
  },
];

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
};

export const profileEntries: ProfileEntry[] = [
  {
    topic: "food",
    value: "Vegetarian",
    kind: "hard limit",
    sureness: "always",
    source: "you told me",
  },
  {
    topic: "food",
    value: "No shellfish (allergy)",
    kind: "hard limit",
    sureness: "always",
    source: "you told me",
  },
  {
    topic: "pace",
    value: "relaxed",
    kind: "taste",
    sureness: "usually",
    source: "from your Kyoto trip",
  },
  {
    topic: "day shape",
    value: "Late starts, around 10:00",
    kind: "taste",
    sureness: "I think",
    source: "from your Kyoto trip",
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

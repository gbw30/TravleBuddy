import type { SamplePlace, SampleTrip } from "./types";

// Sample data for the prototype only. Places are real Tokyo names, but hours,
// prices, ratings and distances here are illustrative, not provider data.
const places: Record<string, SamplePlace> = {};

function add(
  id: string,
  name: string,
  essentials: string,
  summary: string,
  reason: string,
  details: Partial<SamplePlace> = {},
) {
  places[id] = {
    id,
    name,
    essentials,
    summary,
    reason,
    address: "Tokyo",
    hours: null,
    priceLevel: null,
    rating: null,
    photo: null,
    photoCredit: null,
    visitMinutes: 90,
    ...details,
  };
}

// Already decided
add(
  "haneda",
  "Haneda Airport (HND)",
  "Flight NH 212 lands",
  "Your flight from Singapore arrives at Terminal 3.",
  "This is your booked flight, so the first day starts here.",
  { address: "Hanedakuko, Ota", visitMinutes: 60 },
);
add(
  "hotel-graphy",
  "Hotel Graphy Nezu",
  "Check-in from 16:00",
  "A small hotel on a quiet residential street in Nezu.",
  "This is the stay you booked, in the quiet kind of area you asked for.",
  { address: "4-5-10 Ikenohata, Taito", visitMinutes: 45 },
);
add(
  "teamlab",
  "teamLab Planets TOKYO",
  "Ticket for 15:00",
  "Walk-through digital art rooms, some of them ankle-deep in water.",
  "You booked this ticket yourself, so I planned the day around it.",
  {
    address: "6-1-16 Toyosu, Koto",
    hours: "09:00–22:00",
    priceLevel: 3,
    rating: 4.5,
    visitMinutes: 120,
  },
);

// Day 2 morning
add(
  "senso-ji",
  "Senso-ji Temple",
  "Temple · 25 min by train",
  "Tokyo's oldest temple, reached through the Nakamise shopping street.",
  "You like slow mornings with one main sight, and it leaves an easy ride to teamLab at 15:00.",
  {
    address: "2-3-1 Asakusa, Taito",
    hours: "06:00–17:00",
    rating: 4.5,
    photo: "/prototype/photos/senso-ji.jpg",
    photoCredit: "Photo: Guilhem Vellut, CC BY 2.0, via Wikimedia Commons",
    visitMinutes: 120,
  },
);
add(
  "national-museum",
  "Tokyo National Museum",
  "Museum · 15 min walk",
  "Japan's largest collection of art and antiquities, in Ueno Park.",
  "You chose museums over shopping, and it is a short walk from your hotel on a morning with no rush.",
  {
    address: "13-9 Uenokoen, Taito",
    hours: "09:30–17:00",
    priceLevel: 2,
    rating: 4.4,
    visitMinutes: 150,
    photo: "/prototype/photos/national-museum.jpg",
    photoCredit: "Photo: Wiiii, CC BY-SA 3.0, via Wikimedia Commons",
  },
);
add(
  "nezu-shrine",
  "Nezu Shrine",
  "Shrine · 8 min walk",
  "A wooded shrine with a tunnel of red torii gates.",
  "You asked for quiet places, and this one is eight minutes from your hotel before the day gets busy.",
  {
    address: "1-28-9 Nezu, Bunkyo",
    hours: "06:00–17:00",
    photo: "/prototype/photos/nezu-shrine.jpg",
    photoCredit: "Photo: BWard 1997, CC BY 4.0, via Wikimedia Commons",
    visitMinutes: 60,
  },
);
add(
  "yanaka-cemetery",
  "Yanaka Cemetery avenue",
  "Walk · 12 min walk",
  "A broad avenue of cherry trees through an old cemetery.",
  "You like wandering without a plan, and it fits a slow morning before teamLab.",
  { address: "7-5-24 Yanaka, Taito", visitMinutes: 60 },
);
add(
  "kiyosumi",
  "Kiyosumi Garden",
  "Garden · 30 min by train",
  "A stroll garden around a pond with stepping stones.",
  "You prefer gardens to crowds, and it sits on the way to Toyosu for your 15:00 ticket.",
  {
    address: "3-3-9 Kiyosumi, Koto",
    hours: "09:00–17:00",
    priceLevel: 1,
    rating: 4.3,
    visitMinutes: 75,
  },
);
add(
  "shinobazu",
  "Ueno Park and Shinobazu Pond",
  "Park · 10 min walk",
  "A lotus pond with a small temple on an island.",
  "You asked for green space near the hotel, and the morning is free until lunch.",
  { address: "Uenokoen, Taito", visitMinutes: 75 },
);

// Day 2 lunch
add(
  "ts-tantan",
  "T's TanTan",
  "Vegan ramen · on the way",
  "Sesame tantan noodles, entirely plant-based, inside Tokyo Station.",
  "You are vegetarian, and it is on your route to teamLab so lunch costs no extra travel.",
  {
    address: "1-9-1 Marunouchi, Chiyoda",
    hours: "10:00–22:00",
    priceLevel: 1,
    rating: 4.2,
    visitMinutes: 45,
  },
);
add(
  "ain-soph-ginza",
  "Ain Soph. Ginza",
  "Vegan · 20 min by train",
  "Plant-based set lunches and pancakes over four narrow floors.",
  "You are vegetarian and like to sit down properly for lunch, and Ginza is halfway to Toyosu.",
  {
    address: "4-12-1 Ginza, Chuo",
    hours: "11:30–20:00",
    priceLevel: 2,
    rating: 4.3,
    visitMinutes: 60,
  },
);
add(
  "komaki",
  "Komaki Shokudo",
  "Temple-style vegan · 15 min by train",
  "Shojin-style set meals served from a deli counter.",
  "You said you wanted to try temple food, and it is a short ride from your morning stop.",
  {
    address: "8-2 Kanda Neribeicho, Chiyoda",
    hours: "11:00–19:30",
    priceLevel: 1,
    visitMinutes: 45,
  },
);
add(
  "jangara",
  "Vegan Bistro Jangara",
  "Vegan ramen · 35 min by train",
  "A plant-based menu from a long-running ramen shop.",
  "You are vegetarian, though it is further from your 15:00 ticket than the others.",
  {
    address: "1-13-21 Jingumae, Shibuya",
    hours: "11:00–20:00",
    priceLevel: 2,
    visitMinutes: 45,
  },
);
add(
  "mominoki",
  "Mominoki House",
  "Natural food · 35 min by train",
  "Vegetable-led set meals in a calm basement room.",
  "You like quiet rooms, and it has vegetarian sets for a Day 2 lunch.",
  {
    address: "2-18-5 Jingumae, Shibuya",
    hours: "11:30–21:00",
    priceLevel: 2,
    rating: 4.1,
    visitMinutes: 60,
  },
);

// Day 1 dinner
add(
  "nezu-no-ya",
  "Nezu no Ya",
  "Macrobiotic · 6 min walk",
  "Brown rice and vegetable dishes above a natural food shop.",
  "You are vegetarian, and after a long flight it is six minutes from your hotel.",
  {
    address: "1-1-14 Nezu, Bunkyo",
    hours: "11:30–20:00",
    priceLevel: 2,
    visitMinutes: 60,
  },
);
add(
  "kamachiku",
  "Kamachiku",
  "Udon · 7 min walk",
  "Hand-cut udon in a converted brick storehouse with a garden.",
  "You asked for somewhere calm on arrival day, and it is a short walk from the hotel. Ask for the dashi-free dipping sauce.",
  {
    address: "2-14-18 Nezu, Bunkyo",
    hours: "17:30–21:00",
    priceLevel: 2,
    rating: 4.3,
    visitMinutes: 60,
  },
);
add(
  "sasanoyuki",
  "Sasanoyuki",
  "Tofu cuisine · 15 min by train",
  "A tofu restaurant that has served set courses for generations.",
  "You wanted one traditional dinner, and tofu courses suit a vegetarian on the first night.",
  {
    address: "2-15-10 Negishi, Taito",
    hours: "11:30–20:00",
    priceLevel: 3,
    rating: 4.2,
    visitMinutes: 90,
  },
);
add(
  "bon",
  "Fucha Bon",
  "Temple cuisine · 20 min by taxi",
  "Private tatami rooms and a long vegetarian fucha ryori course.",
  "You are vegetarian and like slow meals, and a first-night course sets the pace of the trip.",
  {
    address: "1-2-11 Ryusen, Taito",
    hours: "17:00–21:00",
    priceLevel: 4,
    rating: 4.6,
    visitMinutes: 120,
  },
);
add(
  "ain-soph-journey",
  "Ain Soph. Journey",
  "Vegan · 30 min by train",
  "Plant-based plates and desserts near Shinjuku-sanchome.",
  "You are vegetarian, though Shinjuku is a longer ride than you may want after a flight.",
  {
    address: "3-8-9 Shinjuku, Shinjuku",
    hours: "11:30–21:00",
    priceLevel: 2,
    visitMinutes: 60,
  },
);
add(
  "saido",
  "Saido",
  "Vegan izakaya · 45 min by train",
  "Plant-based versions of izakaya classics.",
  "You are vegetarian and curious about izakaya food, but it is the furthest option on arrival day.",
  {
    address: "2-15-10 Jiyugaoka, Meguro",
    hours: "12:00–21:00",
    priceLevel: 2,
    rating: 4.7,
    visitMinutes: 75,
  },
);

// Day 3 morning
add(
  "meiji-jingu",
  "Meiji Jingu",
  "Shrine · 30 min by train",
  "A forested shrine reached by a long gravel path.",
  "You like starting the day somewhere quiet, and the forest walk suits an unhurried last morning.",
  {
    address: "1-1 Yoyogikamizonocho, Shibuya",
    hours: "06:00–17:00",
    rating: 4.6,
    photo: "/prototype/photos/meiji-jingu.jpg",
    photoCredit: "Photo: Asanagi, CC0, via Wikimedia Commons",
    visitMinutes: 90,
  },
);
add(
  "nezu-museum",
  "Nezu Museum",
  "Museum and garden · 35 min by train",
  "Asian art in a Kengo Kuma building with a hillside garden.",
  "You chose museums and gardens, and this gives you both in one calm morning stop.",
  {
    address: "6-5-1 Minamiaoyama, Minato",
    hours: "10:00–17:00",
    priceLevel: 2,
    rating: 4.5,
    visitMinutes: 120,
  },
);
add(
  "shinjuku-gyoen",
  "Shinjuku Gyoen National Garden",
  "Garden · 30 min by train",
  "Wide lawns, a greenhouse and three styles of garden.",
  "You asked for green space, and it is large enough to wander for a whole morning.",
  {
    address: "11 Naitomachi, Shinjuku",
    hours: "09:00–16:30",
    priceLevel: 1,
    rating: 4.6,
    visitMinutes: 120,
  },
);
add(
  "yoyogi-park",
  "Yoyogi Park",
  "Park · 30 min by train",
  "A big open park beside Harajuku.",
  "You like walking without a plan, and it is free for the whole morning.",
  { address: "2-1 Yoyogikamizonocho, Shibuya", visitMinutes: 75 },
);
add(
  "ota-museum",
  "Ota Memorial Museum of Art",
  "Museum · 30 min by train",
  "A small museum of ukiyo-e woodblock prints.",
  "You prefer small museums to big ones, and it takes about an hour on your last morning.",
  {
    address: "1-10-10 Jingumae, Shibuya",
    hours: "10:30–17:30",
    priceLevel: 1,
    visitMinutes: 60,
  },
);
add(
  "happo-en",
  "Happo-en Garden",
  "Garden · 40 min by train",
  "A hillside garden with centuries-old bonsai and a teahouse.",
  "You like gardens with somewhere to sit, and the teahouse fits a slow morning.",
  {
    address: "1-1-1 Shirokanedai, Minato",
    hours: "10:00–20:00",
    visitMinutes: 75,
  },
);

// Day 3 afternoon
add(
  "shimokitazawa",
  "Shimokitazawa backstreets",
  "Neighbourhood · 15 min by train",
  "Lanes of second-hand shops, record stores and coffee.",
  "You asked for time to wander, and the afternoon is open until your evening.",
  { address: "Kitazawa, Setagaya", visitMinutes: 120 },
);
add(
  "t-site",
  "Daikanyama T-Site",
  "Bookshop · 20 min by train",
  "A bookshop spread across three linked buildings with a lounge.",
  "You like quiet indoor places, and it is an easy stop after lunch on Day 3.",
  {
    address: "17-5 Sarugakucho, Shibuya",
    hours: "09:00–22:00",
    rating: 4.4,
    visitMinutes: 75,
  },
);
add(
  "nakameguro",
  "Nakameguro canal walk",
  "Walk · 20 min by train",
  "A tree-lined canal with small shops and cafes along both banks.",
  "You like walking with no fixed stops, and the canal suits a slow final afternoon.",
  { address: "Kamimeguro, Meguro", visitMinutes: 90 },
);
add(
  "kagurazaka",
  "Kagurazaka lanes",
  "Neighbourhood · 25 min by train",
  "Stone-paved alleys of an old geisha district.",
  "You asked for places to wander, and these lanes are quiet in the afternoon.",
  { address: "Kagurazaka, Shinjuku", visitMinutes: 90 },
);
add(
  "jimbocho",
  "Jimbocho book town",
  "Neighbourhood · 20 min by train",
  "Streets lined with second-hand bookshops and old coffee houses.",
  "You like browsing slowly, and it is on the way back toward your hotel.",
  { address: "Kanda Jinbocho, Chiyoda", visitMinutes: 90 },
);
add(
  "edo-tokyo-open-air",
  "Edo-Tokyo Open Air Architectural Museum, Koganei Park",
  "Museum · 50 min by train",
  "Rescued historic houses and shops rebuilt in a park.",
  "You like museums you can walk through outdoors, though it is the longest ride of the afternoon.",
  {
    address: "3-7-1 Sakuracho, Koganei",
    hours: "09:30–17:30",
    priceLevel: 1,
    rating: 4.5,
    visitMinutes: 150,
  },
);

// Already picked
add(
  "itosho",
  "Itosho",
  "Temple cuisine · 25 min by train",
  "A long-standing shojin ryori restaurant in Azabu-juban.",
  "You wanted one temple-cuisine dinner, and it is a direct ride back from teamLab.",
  {
    address: "3-4-7 Azabujuban, Minato",
    hours: "17:00–21:00",
    priceLevel: 4,
    rating: 4.4,
    visitMinutes: 120,
  },
);
add(
  "brown-rice",
  "Brown Rice by Neal's Yard Remedies",
  "Vegan set lunch · 10 min walk",
  "Seasonal vegetable set meals in a bright courtyard room.",
  "You are vegetarian, and it is ten minutes on foot from your Day 3 morning.",
  {
    address: "5-1-8 Jingumae, Shibuya",
    hours: "11:30–18:00",
    priceLevel: 2,
    rating: 4.2,
    visitMinutes: 60,
  },
);

export const sampleTrip: SampleTrip = {
  title: "Three slow days in Tokyo",
  days: [
    { day: 1, city: "Tokyo", date: "Mon 10 May" },
    { day: 2, city: "Tokyo", date: "Tue 11 May" },
    { day: 3, city: "Tokyo", date: "Wed 12 May" },
  ],
  slots: [
    {
      id: "d1-arrive",
      day: 1,
      start: "14:05",
      label: "Arrival",
      travelIn: null,
    },
    {
      id: "d1-hotel",
      day: 1,
      start: "16:00",
      label: "Check-in",
      travelIn: { means: "Train", minutes: 50 },
    },
    {
      id: "d1-evening",
      day: 1,
      start: "17:30",
      label: "Evening",
      travelIn: { means: "Walk", minutes: 12 },
    },
    {
      id: "d1-dinner",
      day: 1,
      start: "19:30",
      label: "Dinner",
      travelIn: { means: "Walk", minutes: 10 },
    },
    {
      id: "d2-morning",
      day: 2,
      start: "10:00",
      label: "Morning",
      travelIn: { means: "Train", minutes: 25 },
    },
    {
      id: "d2-lunch",
      day: 2,
      start: "12:30",
      label: "Lunch",
      travelIn: { means: "Walk", minutes: 9 },
    },
    {
      id: "d2-teamlab",
      day: 2,
      start: "15:00",
      label: "Afternoon",
      travelIn: { means: "Train", minutes: 35 },
    },
    {
      id: "d2-dinner",
      day: 2,
      start: "19:00",
      label: "Dinner",
      travelIn: { means: "Train", minutes: 25 },
    },
    {
      id: "d3-morning",
      day: 3,
      start: "10:00",
      label: "Morning",
      travelIn: { means: "Train", minutes: 30 },
    },
    {
      id: "d3-lunch",
      day: 3,
      start: "12:30",
      label: "Lunch",
      travelIn: { means: "Walk", minutes: 10 },
    },
    {
      id: "d3-afternoon",
      day: 3,
      start: "14:30",
      label: "Afternoon",
      travelIn: { means: "Train", minutes: 20 },
    },
  ],
  // Main sights first, then meals (PRD 7.5).
  fillOrder: [
    "d2-morning",
    "d3-morning",
    "d3-afternoon",
    "d2-lunch",
    "d1-dinner",
  ],
  places,
  proposals: {
    "d2-morning": [
      ["senso-ji", "national-museum", "nezu-shrine"],
      ["yanaka-cemetery", "kiyosumi", "shinobazu"],
    ],
    "d2-lunch": [
      ["ts-tantan", "ain-soph-ginza", "komaki"],
      ["jangara", "mominoki"],
    ],
    "d1-dinner": [
      ["nezu-no-ya", "kamachiku", "sasanoyuki"],
      ["bon", "ain-soph-journey", "saido"],
    ],
    "d3-morning": [
      ["meiji-jingu", "nezu-museum", "shinjuku-gyoen"],
      ["yoyogi-park", "ota-museum", "happo-en"],
    ],
    "d3-afternoon": [
      ["shimokitazawa", "t-site", "nakameguro"],
      ["edo-tokyo-open-air", "kagurazaka", "jimbocho"],
    ],
  },
  initial: [
    {
      type: "item",
      slotId: "d1-arrive",
      placeId: "haneda",
      locked: true,
      flag: null,
    },
    {
      type: "item",
      slotId: "d1-hotel",
      placeId: "hotel-graphy",
      locked: true,
      flag: null,
    },
    { type: "wander", slotId: "d1-evening", minutes: 90, area: "Yanaka Ginza" },
    { type: "open", slotId: "d1-dinner" },
    { type: "open", slotId: "d2-morning" },
    { type: "open", slotId: "d2-lunch" },
    {
      type: "item",
      slotId: "d2-teamlab",
      placeId: "teamlab",
      locked: true,
      flag: null,
    },
    {
      type: "item",
      slotId: "d2-dinner",
      placeId: "itosho",
      locked: false,
      flag: null,
    },
    { type: "open", slotId: "d3-morning" },
    {
      type: "item",
      slotId: "d3-lunch",
      placeId: "brown-rice",
      locked: false,
      flag: null,
    },
    { type: "open", slotId: "d3-afternoon" },
  ],
  commitments: [
    {
      id: "c-flight",
      kind: "transport",
      title: "Flight NH 212 lands at Haneda",
      date: "Mon 10 May",
      time: "14:05",
    },
    {
      id: "c-hotel",
      kind: "stay",
      title: "Hotel Graphy Nezu, 3 nights",
      date: "Mon 10 May",
      time: "16:00",
    },
    {
      id: "c-teamlab",
      kind: "reservation",
      title: "teamLab Planets ticket",
      date: "Tue 11 May",
      time: "15:00",
    },
    {
      id: "c-yanaka",
      kind: "must-see",
      title: "Yanaka Ginza at sunset",
      date: "Mon 10 May",
      time: null,
    },
  ],
  moveFlags: {
    "senso-ji@d1-dinner": "The main hall closes at 17:00",
    "national-museum@d1-dinner": "Closed at this time",
    "nezu-shrine@d1-dinner": "The grounds close at 17:00",
    "senso-ji@d2-dinner": "The main hall closes at 17:00",
    "national-museum@d2-dinner": "Closed at this time",
    "nezu-shrine@d2-dinner": "The grounds close at 17:00",
    "meiji-jingu@d1-dinner": "Closes at sunset",
    "meiji-jingu@d2-dinner": "Closes at sunset",
    "itosho@d2-morning": "Opens at 17:00",
    "itosho@d3-morning": "Opens at 17:00",
    "kamachiku@d2-lunch": "Opens at 17:30",
  },
  agentLines: {
    "d2-morning":
      "For the morning of Day 2 at 10:00, I'd start with one of these. Each leaves you an easy ride to teamLab at 15:00.",
    "d3-morning":
      "For the morning of Day 3 at 10:00, here are three calm places to begin your last day.",
    "d3-afternoon":
      "For the afternoon of Day 3 at 14:30, I'd suggest somewhere to wander.",
    "d2-lunch":
      "For lunch on Day 2 at 12:30, I'd suggest one of these. All are vegetarian-friendly.",
    "d1-dinner":
      "For dinner on Day 1 at 19:30, close to your hotel after the flight, I'd suggest one of these.",
  },
};

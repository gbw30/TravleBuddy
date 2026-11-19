// A reply in Overpass's JSON form for a query ending `out center meta`. It is
// hand-made, not fetched: the ids and tags are of real Lisbon places as best
// remembered, and the edit data (version, changeset, user) is illustrative.
// Tests use it to check that only the kept tags and the edit time survive.
export const overpassFixture = {
  version: 0.6,
  generator: "Overpass API",
  osm3s: {
    timestamp_osm_base: "2026-11-19T08:00:00Z",
    copyright:
      "The data included in this document is from www.openstreetmap.org.",
  },
  elements: [
    {
      type: "way",
      id: 4543256,
      center: { lat: 38.6916, lon: -9.216 },
      timestamp: "2026-03-14T10:22:41Z",
      version: 31,
      changeset: 148812345,
      user: "some_mapper",
      uid: 123456,
      tags: {
        name: "Torre de Belém",
        "name:en": "Belém Tower",
        tourism: "attraction",
        historic: "tower",
        wikidata: "Q192683",
        wikipedia: "pt:Torre de Belém",
        website: "https://www.torrebelem.gov.pt",
        opening_hours: "Tu-Su 10:00-18:30; Mo off",
        check_date: "2025-09-02",
        "check_date:opening_hours": "2025-09-02",
        "addr:street": "Avenida de Brasília",
        fee: "yes",
        wheelchair: "limited",
        source: "survey",
      },
    },
    {
      type: "node",
      id: 1234567890,
      lat: 38.7107,
      lon: -9.1417,
      timestamp: "2025-06-30T17:05:09Z",
      version: 6,
      changeset: 99887766,
      user: "another_mapper",
      uid: 654321,
      tags: {
        name: "Time Out Market",
        amenity: "marketplace",
        "contact:website": "https://www.timeoutmarket.com/lisboa",
        cuisine: "portuguese",
        "diet:vegetarian": "yes",
        "diet:vegan": "limited",
        "addr:city": "Lisboa",
        "payment:cards": "yes",
      },
    },
  ],
};

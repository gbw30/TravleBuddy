import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayStamp } from "./day-stamp";
import { ItineraryRow } from "./itinerary-row";
import { PlaceArt } from "./place-art";
import { Postcard, priceLabel, ratingLabel } from "./postcard";
import { TicketStub } from "./ticket-stub";
import type { CardPlace } from "./types";

const place: CardPlace = {
  id: "sometaro",
  name: "Sometaro",
  essentials: "Okonomiyaki · 9 min walk",
  summary: "Cook-it-yourself okonomiyaki in an old wooden house.",
  reason: "You like slow lunches, and it is nine minutes from Senso-ji.",
  address: "2-2-2 Nishiasakusa, Taito",
  hours: null,
  priceLevel: null,
  rating: null,
  photo: null,
  photoCredit: null,
  art: "sea",
};

describe("keepsake components", () => {
  it("postcard front shows the place and is not flipped", () => {
    const html = renderToStaticMarkup(
      <Postcard place={place} showPhoto onPick={() => {}} />,
    );
    expect(html).toContain("Sometaro");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Sometaro. Flip card"');
    expect(html).toContain(">Pick<");
    expect(html).not.toContain(">Save for later<");
  });

  it("names each action after the place and announces the back", () => {
    const html = renderToStaticMarkup(
      <Postcard
        place={place}
        showPhoto
        onPick={() => {}}
        onSave={() => {}}
        onCloserLook={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Pick Sometaro"');
    expect(html).toContain('aria-label="Save Sometaro for later"');
    expect(html).toContain('aria-label="Closer look at Sometaro"');
    expect(html).toContain('aria-live="polite"');
  });

  it("uses the illustration when there is no photo", () => {
    const html = renderToStaticMarkup(<PlaceArt place={place} showPhoto />);
    expect(html).toContain('data-art="sea"');
    expect(html).not.toContain("<img");
  });

  it("uses the photo only when photos are on", () => {
    const withPhoto = { ...place, photo: "/prototype/photos/sometaro.jpg" };
    expect(
      renderToStaticMarkup(<PlaceArt place={withPhoto} showPhoto />),
    ).toContain('alt="Sometaro"');
    expect(
      renderToStaticMarkup(<PlaceArt place={withPhoto} showPhoto={false} />),
    ).not.toContain("<img");
  });

  it("states unknown price and rating", () => {
    expect(priceLabel(null)).toBe("Price unknown");
    expect(priceLabel(2)).toBe("¥¥");
    expect(ratingLabel(null)).toBe("No rating yet");
    expect(ratingLabel(4.5)).toBe("4.5 rating");
  });

  it("ticket stub is marked booked", () => {
    expect(
      renderToStaticMarkup(<TicketStub time="09:00" title="Hotel check-out" />),
    ).toContain("BOOKED");
  });

  it("day stamp has visible and spoken text", () => {
    const html = renderToStaticMarkup(<DayStamp city="Tokyo" day={2} />);
    expect(html).toContain("TOKYO · DAY 2");
    expect(html).toContain('aria-label="Tokyo, day 2"');
  });

  it("open active row says it is being chosen, and flags are text", () => {
    expect(
      renderToStaticMarkup(
        <ItineraryRow time="12:30" title="Lunch" variant="open" active />,
      ),
    ).toContain("choosing now");
    expect(
      renderToStaticMarkup(
        <ItineraryRow
          time="20:00"
          title="Senso-ji"
          variant="item"
          flag="Closed at this time"
        />,
      ),
    ).toContain("Closed at this time");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CloserLook } from "./closer-look";
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
  links: null,
  hoursDoubt: null,
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

  describe("the closer look", () => {
    const look = (over: Partial<CardPlace>) =>
      renderToStaticMarkup(
        <CloserLook
          place={{ ...place, ...over }}
          variant="overlay"
          showPhoto
          onClose={() => {}}
        />,
      );
    const links = {
      website: "https://sometaro.example",
      maps: "https://www.google.com/maps/search/?api=1&query=Sometaro",
      osm: "https://www.openstreetmap.org/node/1",
    };

    it("puts the doubt under the hours in the label style", () => {
      const html = look({
        hours: "Mo-Su 09:00-18:00",
        hoursDoubt: "Last updated on the map in 2021. Worth a check.",
      });
      expect(html).toContain(
        '<dd>Mo-Su 09:00-18:00<p class="font-sans text-[13px] leading-6 text-muted">Last updated on the map in 2021. Worth a check.</p></dd>',
      );
      expect(look({})).not.toContain("Worth a check");
    });

    it("lists the three links, each opening in a new tab and named", () => {
      const html = look({ links });
      expect(html).toContain("Check it yourself");
      for (const [href, name] of [
        [links.website, "Sometaro website, opens in a new tab"],
        [links.maps, "Sometaro on Google Maps, opens in a new tab"],
        [links.osm, "Sometaro on OpenStreetMap, opens in a new tab"],
      ]) {
        const tag = html
          .match(/<a [^>]*>/g)
          ?.find((item) =>
            item.includes(`href="${href?.replace("&", "&amp;")}"`),
          );
        expect(tag).toContain('target="_blank"');
        expect(tag).toContain('rel="noopener noreferrer"');
        expect(tag).toContain(`aria-label="${name}"`);
      }
    });

    it("leaves out a link there is none for, and the row for a sample", () => {
      const html = look({ links: { ...links, website: null, osm: null } });
      expect(html).toContain("on Google Maps");
      expect(html).not.toContain("website");
      expect(html).not.toContain("OpenStreetMap");
      expect(look({ links: null })).not.toContain("Check it yourself");
    });
  });

  it("uses the postcard back when there is no photo", () => {
    const html = renderToStaticMarkup(<PlaceArt place={place} showPhoto />);
    expect(html).toContain('data-qa="postcard-back"');
    expect(html).toContain("No photo yet");
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

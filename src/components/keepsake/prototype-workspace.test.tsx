import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { initialState } from "@/features/prototype/planning-state";
import { sampleTrip } from "@/features/prototype/sample-trip";

import { DISCARD_REASONS } from "./discard-reasons";
import {
  PrototypeWorkspace,
  type WorkspaceOptions,
} from "./prototype-workspace";

const options: WorkspaceOptions = {
  photos: true,
  closerLook: "enlarged",
  phoneItinerary: "sheet",
  built: false,
};

describe("prototype workspace", () => {
  it("opens on the first proposal with three postcards and the itinerary", () => {
    const html = renderToStaticMarkup(
      <PrototypeWorkspace trip={sampleTrip} options={options} />,
    );
    const first = initialState(sampleTrip).activeSlotId!;
    expect(html).toContain(sampleTrip.agentLines[first].replace("'", "&#x27;"));
    expect(html.match(/data-qa="postcard"/g)).toHaveLength(3);
    expect(html).toContain('data-qa="live-itinerary"');
    expect(html).toContain('data-qa="ticket-stub"');
    expect(html).toContain("choosing now");
  });

  it("shows the build report when opened from Quick plan", () => {
    const html = renderToStaticMarkup(
      <PrototypeWorkspace
        trip={sampleTrip}
        options={{ ...options, built: true }}
      />,
    );
    for (const heading of [
      "What I built",
      "What I assumed",
      "What I could not fit",
      "Where I was unsure",
    ]) {
      expect(html).toContain(heading);
    }
  });

  it("a built trip starts with nothing to undo", () => {
    const html = renderToStaticMarkup(
      <PrototypeWorkspace
        trip={sampleTrip}
        options={{ ...options, built: true }}
      />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Undo<\/button>/);
  });

  it("uses the fixed discard reasons", () => {
    expect(DISCARD_REASONS).toEqual([
      "Too expensive",
      "Too far",
      "Not my taste",
      "Already been",
      "Too touristy",
      "Too busy or loud",
      "Wrong time of day",
      "Something else",
    ]);
  });
});

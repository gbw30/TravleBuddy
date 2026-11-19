import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BuildReport } from "@/use-cases/plan-snapshot";

import { BuildReportPanel } from "./build-report";

const done: BuildReport = {
  building: false,
  days: [
    { day: 1, date: "2027-04-12", built: true },
    { day: 2, date: "2027-04-13", built: true },
  ],
  built: ["2 days in Lisbon.", "I chose 4 places: 2 to see and 2 to eat at."],
  assumed: [{ line: "Pace: relaxed (you told me).", step: 4 }],
  unfitted: [
    { line: "Nothing I know fits dinner on day 1.", slotId: "d1-dinner" },
  ],
  unsure: [
    {
      line: "Two places were close for lunch on day 2. I chose Garden Table.",
      slotId: "d2-lunch",
    },
    {
      line: "I do not know the opening hours of Castle. Check before you go.",
      slotId: null,
    },
  ],
};
const show = (report: BuildReport, problem: string | null = null) =>
  renderToStaticMarkup(
    <BuildReportPanel
      tripId="trip-1"
      report={report}
      problem={problem}
      onChoose={() => {}}
      onContinue={() => {}}
      onHide={() => {}}
    />,
  );

describe("the report of a build on screen", () => {
  it("says what was built, assumed, not fitted and unsure", () => {
    const html = show(done);
    expect(html).toContain("Your trip is <em>built</em>");
    for (const heading of [
      "What I built",
      "What I assumed",
      "What I could not fit",
      "Where I was unsure",
    ]) {
      expect(html, heading).toContain(heading);
    }
    expect(html).toContain(
      "2 days in Lisbon. I chose 4 places: 2 to see and 2 to eat at.",
    );
  });

  it("lets every assumption be changed, at the step of the brief that holds it", () => {
    const html = show(done);
    expect(html).toContain('href="/trips/trip-1/brief?step=4"');
    expect(html).toContain('aria-label="Change. Pace: relaxed (you told me)."');
  });

  it("offers a choice where one can be made, and only there", () => {
    const html = show(done);
    expect(html.match(/>Let me choose</g)).toHaveLength(2);
    expect(html).toContain(
      'aria-label="Let me choose. Nothing I know fits dinner on day 1."',
    );
  });

  it("says so plainly when a part has nothing in it", () => {
    const html = show({ ...done, assumed: [], unfitted: [], unsure: [] });
    expect(html).toContain("Nothing: you answered everything I went by.");
    expect(html).toContain("Nothing was left over.");
    expect(html).toContain("Nowhere this time.");
    expect(html).not.toContain("Let me choose");
  });

  it("shows each day's progress while the build runs", () => {
    const html = show({
      ...done,
      building: true,
      days: [
        { day: 1, date: "2027-04-12", built: true },
        { day: 2, date: "2027-04-13", built: false },
        { day: 3, date: "2027-04-14", built: false },
      ],
    });
    expect(html).toContain("Building your <em>trip</em>");
    expect(html).toContain("You can leave and come back; I keep what is");
    expect(html.match(/>built</g)).toHaveLength(1);
    expect(html.match(/working on it…/g)).toHaveLength(1);
    expect(html.match(/to come/g)).toHaveLength(1);
    expect(html).not.toContain("What I assumed");
  });

  it("says why a build stopped and offers to continue", () => {
    const html = show(
      {
        ...done,
        building: true,
        days: [{ day: 1, date: "2027-04-12", built: false }],
      },
      "That did not work. Please try again.",
    );
    expect(html).toContain("That did not work. Please try again.");
    expect(html).toContain("Continue building");
    expect(html).not.toContain("working on it…");
  });
});

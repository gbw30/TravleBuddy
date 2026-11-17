import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { profileEntries } from "@/features/prototype/sample-home";

import PrototypeLayout from "./layout";
import PrototypeNewTrip from "./new/page";
import PrototypeHome from "./page";
import PrototypeProfile from "./profile/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ratesReply = {
  base: "JPY",
  date: "2026-11-13",
  rates: {
    AUD: 0.0092,
    CAD: 0.0089,
    CHF: 0.0052,
    EUR: 0.0057,
    GBP: 0.0047,
    SGD: 0.0081,
    USD: 0.0063,
  },
};

describe("prototype pages", () => {
  it("layout shows the navigation without a prototype label or Discover", () => {
    const html = renderToStaticMarkup(PrototypeLayout({ children: null }));
    expect(html).not.toContain("sample data");
    expect(html).toContain('href="/prototype/new"');
    expect(html).not.toContain("Discover");
  });

  it("home lists trips in all three states and links to a new trip", () => {
    const html = renderToStaticMarkup(<PrototypeHome />);
    for (const state of ["Planning", "Upcoming", "Past"]) {
      expect(html).toContain(state);
    }
    expect(html).toContain('href="/prototype/trip"');
    expect(html).toContain("New trip");
  });

  it("profile separates rules from habits and shows sureness and source", async () => {
    vi.stubGlobal("fetch", async () => Response.json(ratesReply));
    const html = renderToStaticMarkup(await PrototypeProfile());
    expect(html).toContain("Rules I <em>never</em> break");
    expect(html).toContain("Still a guess. Is this right?");
    expect(html).toContain("Fairly sure");
    expect(html).toContain('type="range"');
    expect(html).toContain("you told me");
    expect(html).toContain(
      profileEntries.find((e) => e.source !== "you told me")!.source,
    );
  });

  it("profile offers every currency when rates arrive", async () => {
    vi.stubGlobal("fetch", async () => Response.json(ratesReply));
    const html = renderToStaticMarkup(await PrototypeProfile());
    expect(html).toContain('aria-label="Currency for your daily budget"');
    expect(html).toContain("<option>SGD</option>");
    expect(html).not.toContain("Exchange rates are unavailable");
  });

  it("profile stays in yen and says so when rates cannot be fetched", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const html = renderToStaticMarkup(await PrototypeProfile());
    expect(html).toContain("Exchange rates are unavailable right now");
    expect(html).toContain("About ¥15,000 a day");
    expect(html).toMatch(/<select[^>]*disabled/);
  });

  it("starting a trip shows the ticket answer, then the two ways to plan", () => {
    const html = renderToStaticMarkup(<PrototypeNewTrip />);
    expect(html).toContain("Not booked yet");
    expect(html).toContain("Plan it together");
    expect(html).toContain("Build it for me");
    // Planning together is chosen to begin with, so the main button goes there.
    expect(html).toContain('href="/prototype/trip"');
  });
});

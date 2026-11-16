import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { profileEntries } from "@/features/prototype/sample-home";

import PrototypeLayout from "./layout";
import PrototypeNewTrip from "./new/page";
import PrototypeHome from "./page";
import PrototypeProfile from "./profile/page";

afterEach(() => vi.unstubAllEnvs());

describe("prototype pages", () => {
  it("is not served in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => PrototypeLayout({ children: null })).toThrow();
  });

  it("layout shows the prototype banner and navigation without Discover", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const html = renderToStaticMarkup(PrototypeLayout({ children: null }));
    expect(html).toContain("Prototype · sample data");
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

  it("profile separates rules from habits and shows sureness and source", () => {
    const html = renderToStaticMarkup(<PrototypeProfile />);
    expect(html).toContain("Rules I <em>never</em> break");
    expect(html).toContain("Still a guess. Is this right?");
    expect(html).toContain("Fairly sure");
    expect(html).toContain('type="range"');
    expect(html).toContain("you told me");
    expect(html).toContain(
      profileEntries.find((e) => e.source !== "you told me")!.source,
    );
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

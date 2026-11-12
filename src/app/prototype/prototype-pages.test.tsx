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

  it("profile shows kind, sureness and source for each entry", () => {
    const html = renderToStaticMarkup(<PrototypeProfile />);
    expect(html).toContain("Hard limit");
    expect(html).toContain("you told me");
    expect(html).toContain(
      profileEntries.find((e) => e.source !== "you told me")!.source,
    );
  });

  it("starting a trip asks about tickets, then how to plan", () => {
    const html = renderToStaticMarkup(<PrototypeNewTrip />);
    expect(html).toContain("Do you already have tickets?");
    expect(html).toContain("Guided planning");
    expect(html).toContain("Quick plan");
  });
});

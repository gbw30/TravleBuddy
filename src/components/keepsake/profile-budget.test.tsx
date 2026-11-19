import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Rates } from "@/lib/currency";
import type { ShownEntry } from "@/use-cases/profile-view";

import { BudgetCard } from "./profile-budget";

const rates: Rates = {
  date: "2026-11-18",
  perYen: {
    JPY: 1,
    USD: 0.0066,
    EUR: 0.006,
    GBP: 0.0052,
    SGD: 0.0088,
    AUD: 0.01,
    CAD: 0.009,
    CHF: 0.0058,
  },
};
const entry = (value: string): ShownEntry => ({
  id: "b1",
  topic: "budget",
  value,
  label: value,
  sureness: "always",
  source: { type: "told" },
});
const show = (saved?: ShownEntry, withRates: Rates | null = rates) =>
  renderToStaticMarkup(
    <ul>
      <BudgetCard
        entry={saved}
        rates={withRates}
        busy={false}
        onSave={() => {}}
        onRemove={() => {}}
      />
    </ul>,
  );
const slider = (html: string) =>
  html.match(/<input type="range"[^>]*>/)?.[0] ?? "";

describe("the daily budget card", () => {
  it("stands at the middle level in yen before anything is set, and says it is not set", () => {
    const html = show();
    expect(html).toContain("About ¥15,000 a day");
    expect(slider(html)).toContain('value="1"');
    expect(html).toContain("¥8,000");
    expect(html).toContain("¥25,000");
    expect(html).toContain("Not set yet. Move the slider to tell me.");
    expect(html).toContain("Choose a currency above");
  });

  it("says what the setting does, and what it does not", () => {
    const html = show();
    expect(html).toContain("I fill this in as the budget of a new trip");
    expect(html).toContain("I do not know what places cost");
  });

  it("shows a saved budget in its own currency, at its level, with source and sureness", () => {
    // 25,000 yen is about 150 euros at this rate.
    const html = show(entry("150 EUR"));
    expect(html).toContain("About €150 a day");
    expect(slider(html)).toContain('value="2"');
    expect(html).toMatch(/<option[^>]*selected=""[^>]*>EUR<\/option>/);
    expect(html).toContain("€48");
    expect(html).toContain("€90");
    expect(html).toContain("you told me");
    expect(html).toContain('aria-label="Remove Daily budget"');
    expect(html).toContain(
      "1 EUR = ¥167 · European Central Bank rate of 2026-11-18",
    );
  });

  it("stays in yen when the rates cannot be had", () => {
    const html = show(entry("15000 JPY"), null);
    expect(html).toContain("About ¥15,000 a day");
    expect(html).toContain(
      "Exchange rates are unavailable right now, so amounts stay in yen.",
    );
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(slider(html)).not.toContain('disabled=""');
  });

  it("keeps a budget saved in another currency as it is, without a scale, when there are no rates", () => {
    const html = show(entry("90 EUR"), null);
    expect(html).toContain("About €90 a day");
    expect(slider(html)).toContain('disabled=""');
    expect(html).toContain('aria-label="Remove Daily budget"');
  });
});

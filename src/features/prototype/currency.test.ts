import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  budgetStops,
  formatMoney,
  fromYen,
  parseRates,
} from "./currency";

// The shape the rate service returns, with rates per one yen.
const reply = {
  amount: 1,
  base: "JPY",
  date: "2026-11-13",
  rates: {
    AUD: 0.0092111,
    CAD: 0.0089114,
    CHF: 0.0052401,
    EUR: 0.0056551,
    GBP: 0.0047254,
    SGD: 0.0080507,
    USD: 0.0062501,
  },
};
const rates = parseRates(reply)!;

describe("exchange rates", () => {
  it("accepts a complete reply and adds the yen itself", () => {
    expect(rates.date).toBe("2026-11-13");
    expect(rates.perYen.JPY).toBe(1);
    expect(rates.perYen.USD).toBe(0.0062501);
    expect(Object.keys(rates.perYen).sort()).toEqual([...CURRENCIES].sort());
  });

  it("rejects a reply it cannot trust", () => {
    expect(parseRates(null)).toBeNull();
    expect(parseRates("rates")).toBeNull();
    expect(parseRates({ ...reply, base: "USD" })).toBeNull();
    expect(parseRates({ ...reply, date: 20261113 })).toBeNull();
    expect(parseRates({ ...reply, rates: { USD: 0.006 } })).toBeNull();
    expect(
      parseRates({ ...reply, rates: { ...reply.rates, EUR: "0.0056" } }),
    ).toBeNull();
    expect(
      parseRates({ ...reply, rates: { ...reply.rates, GBP: 0 } }),
    ).toBeNull();
    expect(
      parseRates({ ...reply, rates: { ...reply.rates, CHF: -1 } }),
    ).toBeNull();
  });

  it("converts yen and rounds to two figures, since a budget is not exact", () => {
    expect(fromYen(15000, "USD", rates)).toBe(94); // 93.75
    expect(fromYen(25000, "EUR", rates)).toBe(140); // 141.38
    expect(fromYen(8000, "GBP", rates)).toBe(38); // 37.80
  });

  it("leaves yen amounts exactly as they are", () => {
    expect(fromYen(15000, "JPY", rates)).toBe(15000);
    expect(fromYen(12345, "JPY", rates)).toBe(12345);
  });

  it("writes amounts so that two kinds of dollar cannot be confused", () => {
    expect(formatMoney(15000, "JPY")).toBe("¥15,000");
    expect(formatMoney(94, "USD")).toBe("$94");
    // A non-breaking space, so the code and the amount never split across lines.
    expect(formatMoney(120, "SGD")).toBe("SGD\u00a0120");
    expect(formatMoney(140, "AUD")).toBe("A$140");
  });

  it("turns the budget stops into the chosen currency", () => {
    expect(budgetStops([8000, 15000, 25000], "JPY", rates)).toEqual([
      "¥8,000",
      "¥15,000",
      "¥25,000",
    ]);
    expect(budgetStops([8000, 15000, 25000], "USD", rates)).toEqual([
      "$50",
      "$94",
      "$160",
    ]);
  });

  it("stays in yen when there are no rates", () => {
    expect(budgetStops([8000, 15000], "USD", null)).toEqual([
      "¥8,000",
      "¥15,000",
    ]);
  });
});

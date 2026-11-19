import { describe, expect, it } from "vitest";

import { dailyBudgetOf, dailyBudgetValue } from "./contracts";

describe("the usual daily budget", () => {
  it("is kept as an amount and a currency", () => {
    expect(dailyBudgetValue({ amount: 90, currency: "EUR" })).toBe("90 EUR");
    expect(dailyBudgetValue({ amount: 15000.4, currency: "JPY" })).toBe(
      "15000 JPY",
    );
    expect(dailyBudgetOf("90 EUR")).toEqual({ amount: 90, currency: "EUR" });
    expect(
      dailyBudgetOf(dailyBudgetValue({ amount: 25000, currency: "JPY" })),
    ).toEqual({
      amount: 25000,
      currency: "JPY",
    });
  });

  it("is not read from free words, a currency it does not know, or no amount", () => {
    for (const words of [
      "150 EUR a day",
      "about 90 EUR",
      "90 XYZ",
      "0 EUR",
      "EUR 90",
      "90eur",
      "",
    ]) {
      expect(dailyBudgetOf(words), words).toBeNull();
    }
  });
});

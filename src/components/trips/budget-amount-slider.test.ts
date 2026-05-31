import { describe, expect, it } from "vitest";
import {
  getBudgetSliderMax,
  normalizeBudgetSliderValue,
} from "./budget-amount-slider";

describe("budget amount slider helpers", () => {
  it("normalizes blank budget amounts to the shared default", () => {
    expect(normalizeBudgetSliderValue(null)).toBe(1500);
    expect(normalizeBudgetSliderValue("")).toBe(1500);
  });

  it("keeps the slider max large enough for existing higher budgets", () => {
    expect(getBudgetSliderMax(1500)).toBe(20000);
    expect(getBudgetSliderMax(25000)).toBe(25000);
  });
});

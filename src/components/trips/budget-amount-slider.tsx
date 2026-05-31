"use client";

import { useState } from "react";

export const DEFAULT_BUDGET_SLIDER_VALUE = 1500;
export const DEFAULT_BUDGET_SLIDER_MAX = 20000;

export function normalizeBudgetSliderValue(value: number | string | null) {
  const amount = typeof value === "number" ? value : Number(value);

  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount)
    : DEFAULT_BUDGET_SLIDER_VALUE;
}

export function getBudgetSliderMax(value: number) {
  return Math.max(DEFAULT_BUDGET_SLIDER_MAX, normalizeBudgetSliderValue(value));
}

export function BudgetAmountSlider({
  value,
  currency,
  onValueChange,
}: {
  value: number | string | null;
  currency: string | null;
  onValueChange?: (value: string) => void;
}) {
  const [budgetAmount, setBudgetAmount] = useState(
    normalizeBudgetSliderValue(value),
  );
  const sliderMax = getBudgetSliderMax(budgetAmount);
  const displayCurrency = currency || "USD";

  function updateBudgetAmount(value: string) {
    setBudgetAmount(normalizeBudgetSliderValue(value));
    onValueChange?.(value);
  }

  return (
    <label className="text-sm font-medium text-zinc-800">
      Trip budget amount: {displayCurrency} {budgetAmount}
      <input type="hidden" name="budgetAmount" value={budgetAmount} />
      <input
        type="range"
        min="100"
        max={sliderMax}
        step="100"
        value={budgetAmount}
        onChange={(event) => updateBudgetAmount(event.target.value)}
        className="mt-3 w-full accent-zinc-950"
      />
      <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">
        This is the primary budget constraint used when weighing recommendation
        options.
      </span>
    </label>
  );
}

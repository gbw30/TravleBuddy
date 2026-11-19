"use client";

import { useState, type CSSProperties } from "react";

import {
  dailyBudgetOf,
  sourceWords,
  type DailyBudget,
} from "@/features/memory/contracts";
import {
  CURRENCIES,
  formatMoney,
  fromYen,
  type Currency,
  type Rates,
} from "@/lib/currency";
import type { ShownEntry } from "@/use-cases/profile-view";

import { card, Sure } from "./profile-parts";
import { eyebrow, field, lift, quiet } from "./styles";

/** The three levels of a day's spending, kept in yen and shown in any currency. */
const YEN_LEVELS = [8000, 15000, 25000];

/**
 * The traveller's usual daily budget (PRD 12.5): one of three levels, shown
 * in the currency they choose at the day's rate. Saved as an amount and a
 * currency, which fills in the budget of a new trip's brief.
 */
export function BudgetCard({
  entry,
  rates,
  busy,
  onSave,
  onRemove,
}: {
  /** The saved budget entry, when there is one that reads as an amount. */
  entry: ShownEntry | undefined;
  rates: Rates | null;
  busy: boolean;
  onSave: (budget: DailyBudget) => void;
  onRemove: (entry: ShownEntry) => void;
}) {
  const saved = entry ? dailyBudgetOf(entry.value) : null;
  const [chosen, setChosen] = useState<Currency | null>(null);
  const [moved, setMoved] = useState<number | null>(null);
  // Without rates only yen can be worked out.
  const currency: Currency = rates
    ? (chosen ?? saved?.currency ?? "JPY")
    : "JPY";
  // A budget saved in another currency cannot be placed on the scale without rates.
  const frozen = !rates && saved !== null && saved.currency !== "JPY";
  const inCurrency = (code: Currency) =>
    YEN_LEVELS.map((yen) => (rates ? fromYen(yen, code, rates) : yen));
  const amounts = inCurrency(currency);
  // The level a saved budget stands at, worked out in its own currency, so
  // it stays put while the currency shown is changed.
  const savedLevel =
    saved && !frozen
      ? inCurrency(saved.currency).reduce(
          (best, value, at, all) =>
            Math.abs(value - saved.amount) < Math.abs(all[best] - saved.amount)
              ? at
              : best,
          0,
        )
      : null;
  const index = moved ?? savedLevel ?? 1;
  const shown: DailyBudget = frozen
    ? saved
    : { amount: amounts[index], currency };

  const settle = () => {
    if (moved === null) return;
    setMoved(null);
    const next = { amount: amounts[moved], currency };
    if (saved?.amount !== next.amount || saved.currency !== next.currency) {
      onSave(next);
    }
  };

  return (
    <li
      data-qa="profile-budget"
      className={`relative flex flex-col px-6 pt-[22px] pb-5 ${lift} ${card}`}
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className={eyebrow}>Daily budget</p>
        <select
          aria-label="Currency for your daily budget"
          value={currency}
          disabled={!rates || busy}
          onChange={(event) => {
            const next = event.target.value as Currency;
            setChosen(next);
            // A saved budget follows the currency shown, at the same level.
            if (saved && rates) {
              onSave({
                amount: fromYen(YEN_LEVELS[index], next, rates),
                currency: next,
              });
            }
          }}
          className={`${field} h-8 cursor-pointer py-0 font-mono tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {CURRENCIES.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </select>
      </div>
      <h3 className="mt-2.5 text-[28px] leading-[1.1] tracking-[-0.015em] italic">
        About {formatMoney(shown.amount, shown.currency)} a day
      </h3>
      <p className="mt-2 text-[14px] text-muted">
        I fill this in as the budget of a new trip&rsquo;s brief. Suggestions do
        not go by it: I do not know what places cost.
      </p>
      <input
        type="range"
        min={0}
        max={amounts.length - 1}
        step={1}
        value={index}
        disabled={frozen}
        aria-label="Daily budget"
        aria-valuetext={`About ${formatMoney(shown.amount, shown.currency)} a day`}
        onChange={(event) => setMoved(Number(event.target.value))}
        onPointerUp={settle}
        onKeyUp={settle}
        onBlur={settle}
        className="keepsake-range mt-6 disabled:opacity-50"
        style={
          {
            "--fill": `${(index / (amounts.length - 1)) * 100}%`,
          } as CSSProperties
        }
      />
      <p
        aria-hidden
        className="mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.06em] text-muted uppercase"
      >
        {amounts.map((amount, at) => (
          <span key={amount} className={at === index ? "text-ink" : ""}>
            {formatMoney(amount, currency)}
          </span>
        ))}
      </p>
      <p
        aria-live="polite"
        className="mt-3 text-[12.5px] leading-snug text-muted"
      >
        {!rates
          ? "Exchange rates are unavailable right now, so amounts stay in yen."
          : currency === "JPY"
            ? "Choose a currency above to see this converted at today’s rate."
            : `1 ${currency} = ${formatMoney(Number((1 / rates.perYen[currency]).toPrecision(3)), "JPY")} · European Central Bank rate of ${rates.date}`}
      </p>
      <div className="mt-auto pt-6">
        {entry && saved ? (
          <p className="flex flex-wrap items-center gap-x-3 border-t border-ink/12 pt-3.5 text-[13px] text-muted">
            <Sure sureness={entry.sureness} />
            <span className="first-letter:uppercase">
              · {sourceWords(entry.source)}
            </span>
            <button
              type="button"
              className={`${quiet} ml-auto`}
              disabled={busy}
              aria-label="Remove Daily budget"
              onClick={() => onRemove(entry)}
            >
              Remove
            </button>
          </p>
        ) : (
          <p className="border-t border-ink/12 pt-3.5 text-[13px] text-muted">
            Not set yet. Move the slider to tell me.
          </p>
        )}
      </div>
    </li>
  );
}

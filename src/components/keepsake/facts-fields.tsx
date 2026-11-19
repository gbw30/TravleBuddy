"use client";

import { cityLabel } from "@/features/places/contracts";
import type { Firmness, TripFacts } from "@/features/trips/contracts";
import { CURRENCIES } from "@/lib/currency";

import { CityPicker } from "./city-picker";
import { field, quiet } from "./styles";

// The fields for a trip's facts (PRD 7.2), shared by the facts form on the
// trip page and the steps of the trip brief.

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const label = "block font-sans text-[13px] text-muted";
const control = `${field} mt-1 block w-full`;

const whole = (value: string) =>
  value === "" ? null : Number.parseInt(value, 10);

type Fields = {
  facts: TripFacts;
  set: (change: Partial<TripFacts>) => void;
};

/** What is wrong with the fields above it, said as soon as it is (TB-QPL-05). */
export function Problem({ text }: { text?: string }) {
  return (
    <p
      aria-live="polite"
      className="mt-2 font-sans text-[13px] font-semibold text-stamp empty:hidden"
    >
      {text}
    </p>
  );
}

export function FirmnessChoice({
  name,
  value,
  words,
  onChange,
}: {
  name: string;
  value: Firmness | null;
  words: Record<Firmness, string>;
  onChange: (value: Firmness) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-sans text-[14px]">
      {(Object.keys(words) as Firmness[]).map((option) => (
        <label key={option} className="inline-flex min-h-8 items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={value === option}
            onChange={() => onChange(option)}
            className="accent-(--color-ink)"
          />
          {words[option]}
        </label>
      ))}
    </div>
  );
}

/** The cities in order, with the nights in each. */
export function WhereFields({
  facts,
  set,
  problem,
}: Fields & { problem?: string }) {
  const setCities = (cities: TripFacts["cities"]) => set({ cities });
  function moveCity(index: number, by: -1 | 1) {
    const cities = [...facts.cities];
    [cities[index], cities[index + by]] = [cities[index + by], cities[index]];
    setCities(cities);
  }

  return (
    <>
      {facts.cities.length === 0 ? (
        <p className="text-[15px] text-muted">No city yet.</p>
      ) : (
        <ol className="space-y-2">
          {facts.cities.map(({ city, nights }, index) => (
            <li
              key={`${cityLabel(city)}-${index}`}
              className="flex flex-wrap items-end gap-x-4 gap-y-1 rounded-lg bg-card px-4 py-3 shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
            >
              <span className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]">
                <span className="block font-serif text-[20px] leading-tight">
                  {city.name}
                </span>
                <span className="block font-sans text-[12.5px] text-muted">
                  {[city.region, city.country].filter(Boolean).join(", ")}
                </span>
              </span>
              <label className={`${label} w-20`}>
                Nights
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={nights ?? ""}
                  onChange={(event) =>
                    setCities(
                      facts.cities.map((entry, at) =>
                        at === index
                          ? { ...entry, nights: whole(event.target.value) }
                          : entry,
                      ),
                    )
                  }
                  className={control}
                />
              </label>
              <span className="flex gap-x-4">
                <button
                  type="button"
                  className={quiet}
                  disabled={index === 0}
                  aria-label={`Earlier: move ${city.name}`}
                  onClick={() => moveCity(index, -1)}
                >
                  Earlier
                </button>
                <button
                  type="button"
                  className={quiet}
                  disabled={index === facts.cities.length - 1}
                  aria-label={`Later: move ${city.name}`}
                  onClick={() => moveCity(index, 1)}
                >
                  Later
                </button>
                <button
                  type="button"
                  className={quiet}
                  onClick={() =>
                    setCities(facts.cities.filter((_, at) => at !== index))
                  }
                >
                  Remove
                  <span className="sr-only"> {city.name}</span>
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <Problem text={problem} />
      {facts.cities.length < 12 && (
        <div className="mt-4">
          <CityPicker
            onPick={(city) =>
              setCities([...facts.cities, { city, nights: null }])
            }
          />
        </div>
      )}
    </>
  );
}

/** The dates, or a length and a rough time of year. */
export function WhenFields({
  facts,
  set,
  problem,
}: Fields & { problem?: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          First day
          <input
            type="date"
            value={facts.startDate ?? ""}
            onChange={(event) => set({ startDate: event.target.value || null })}
            className={control}
          />
        </label>
        <label className={label}>
          Last day
          <input
            type="date"
            value={facts.endDate ?? ""}
            min={facts.startDate ?? undefined}
            onChange={(event) => set({ endDate: event.target.value || null })}
            className={control}
          />
        </label>
      </div>
      <p className="mt-4 text-[14px] text-muted">
        No dates yet? A length and a rough time of year is enough to start.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className={label}>
          About how many nights
          <input
            type="number"
            min={1}
            max={365}
            value={facts.lengthNights ?? ""}
            onChange={(event) =>
              set({ lengthNights: whole(event.target.value) })
            }
            className={control}
          />
        </label>
        <label className={label}>
          Around which month
          <select
            value={facts.timeOfYear ?? ""}
            onChange={(event) => set({ timeOfYear: whole(event.target.value) })}
            className={control}
          >
            <option value="">Not sure yet</option>
            {months.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Problem text={problem} />
    </>
  );
}

export function WhoFields({
  facts,
  set,
  problem,
}: Fields & { problem?: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Adults
          <input
            type="number"
            min={1}
            max={20}
            value={facts.adults ?? ""}
            onChange={(event) => set({ adults: whole(event.target.value) })}
            className={control}
          />
        </label>
        <label className={label}>
          Children
          <input
            type="number"
            min={0}
            max={20}
            value={facts.children ?? ""}
            onChange={(event) => set({ children: whole(event.target.value) })}
            className={control}
          />
        </label>
      </div>
      <Problem text={problem} />
    </>
  );
}

/** An amount, its currency, and whether it is for the trip or a day. */
export function BudgetFields({ facts, set }: Fields) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={label}>
        Amount
        <input
          type="number"
          min={1}
          step="any"
          value={facts.budgetAmount ?? ""}
          onChange={(event) =>
            set({
              budgetAmount:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          className={control}
        />
      </label>
      <label className={label}>
        Currency
        <select
          value={facts.budgetCurrency ?? ""}
          onChange={(event) =>
            set({
              budgetCurrency:
                (event.target.value as TripFacts["budgetCurrency"]) || null,
            })
          }
          className={control}
        >
          <option value="">Choose</option>
          {CURRENCIES.map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        That is
        <select
          value={facts.budgetBasis ?? ""}
          onChange={(event) =>
            set({
              budgetBasis:
                (event.target.value as TripFacts["budgetBasis"]) || null,
            })
          }
          className={control}
        >
          <option value="">Choose</option>
          <option value="TRIP">for the whole trip</option>
          <option value="DAY">a day</option>
        </select>
      </label>
    </div>
  );
}

export const PURPOSES = [
  "Holiday",
  "Honeymoon",
  "Family visit",
  "Celebration",
  "Work",
];

export function PurposeField({ facts, set }: Fields) {
  return (
    <>
      <label className={label}>
        What is the trip for?
        <input
          list="trip-purposes"
          maxLength={120}
          value={facts.purpose ?? ""}
          onChange={(event) => set({ purpose: event.target.value || null })}
          className={control}
        />
      </label>
      <datalist id="trip-purposes">
        {PURPOSES.map((purpose) => (
          <option key={purpose} value={purpose} />
        ))}
      </datalist>
    </>
  );
}

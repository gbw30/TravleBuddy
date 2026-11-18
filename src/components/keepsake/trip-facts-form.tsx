"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { cityLabel } from "@/features/places/contracts";
import type { Firmness, TripFacts } from "@/features/trips/contracts";
import { CURRENCIES } from "@/lib/currency";
import { changeTrip } from "@/lib/trip-api";

import { CityPicker } from "./city-picker";
import { button, eyebrow, field, quiet } from "./styles";

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-ink/12 py-6 md:grid-cols-[150px_minmax(0,1fr)] md:gap-8">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className={`${eyebrow} pt-1`}>
        {title}
      </p>
      <div className="min-w-0">{children}</div>
    </fieldset>
  );
}

function FirmnessChoice({
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

/**
 * The facts of a trip (PRD 7.2): where, when, who, the budget, how firm the
 * dates and budget are, and the purpose. Saved together.
 */
export function TripFactsForm({
  tripId,
  revision,
  initial,
  readOnly,
}: {
  tripId: string;
  revision: number;
  initial: TripFacts;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [facts, setFacts] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const set = (change: Partial<TripFacts>) => {
    setFacts((current) => ({ ...current, ...change }));
    setStatus(null);
  };
  const setCities = (cities: TripFacts["cities"]) => set({ cities });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await changeTrip(tripId, revision, "PATCH", {
      action: "facts",
      facts,
    });
    setSaving(false);
    setStatus(
      result.ok
        ? { ok: true, text: "Saved." }
        : { ok: false, text: result.message },
    );
    router.refresh();
  }

  function moveCity(index: number, by: -1 | 1) {
    const cities = [...facts.cities];
    [cities[index], cities[index + by]] = [cities[index + by], cities[index]];
    setCities(cities);
  }

  return (
    <form onSubmit={save} aria-labelledby="facts-heading">
      <fieldset disabled={readOnly || saving} className="min-w-0">
        <Section title="Where">
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
                      onClick={() => moveCity(index, -1)}
                    >
                      Earlier
                      <span className="sr-only">: move {city.name}</span>
                    </button>
                    <button
                      type="button"
                      className={quiet}
                      disabled={index === facts.cities.length - 1}
                      onClick={() => moveCity(index, 1)}
                    >
                      Later
                      <span className="sr-only">: move {city.name}</span>
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
          {facts.cities.length < 12 && (
            <div className="mt-4">
              <CityPicker
                onPick={(city) =>
                  setCities([...facts.cities, { city, nights: null }])
                }
              />
            </div>
          )}
        </Section>

        <Section title="When">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              First day
              <input
                type="date"
                value={facts.startDate ?? ""}
                onChange={(event) =>
                  set({ startDate: event.target.value || null })
                }
                className={control}
              />
            </label>
            <label className={label}>
              Last day
              <input
                type="date"
                value={facts.endDate ?? ""}
                min={facts.startDate ?? undefined}
                onChange={(event) =>
                  set({ endDate: event.target.value || null })
                }
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
                onChange={(event) =>
                  set({ timeOfYear: whole(event.target.value) })
                }
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
          <FirmnessChoice
            name="dates-firmness"
            value={facts.datesFirmness}
            words={{
              FIXED: "The dates are fixed",
              FLEXIBLE: "The dates can move",
            }}
            onChange={(datesFirmness) => set({ datesFirmness })}
          />
        </Section>

        <Section title="Who">
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
                onChange={(event) =>
                  set({ children: whole(event.target.value) })
                }
                className={control}
              />
            </label>
          </div>
        </Section>

        <Section title="Budget">
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
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
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
                      (event.target.value as TripFacts["budgetCurrency"]) ||
                      null,
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
          <FirmnessChoice
            name="budget-firmness"
            value={facts.budgetFirmness}
            words={{
              FIXED: "The budget is fixed",
              FLEXIBLE: "The budget can stretch",
            }}
            onChange={(budgetFirmness) => set({ budgetFirmness })}
          />
        </Section>

        <Section title="Purpose">
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
            {[
              "Holiday",
              "Honeymoon",
              "Family visit",
              "Celebration",
              "Work",
            ].map((purpose) => (
              <option key={purpose} value={purpose} />
            ))}
          </datalist>
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-4 border-t border-ink/12 pt-6">
          <button type="submit" disabled={saving} className={button}>
            {saving ? "Saving…" : "Save the facts"}
          </button>
          <p
            role="status"
            className={`font-sans text-[14px] ${status?.ok === false ? "text-stamp" : "text-muted"}`}
          >
            {status?.text}
          </p>
        </div>
      )}
    </form>
  );
}

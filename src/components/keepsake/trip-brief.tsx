"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  BRIEF_STEPS,
  briefSections,
  canBuild,
  emptyBrief,
  prefillFromProfile,
  validateBrief,
  type Brief,
} from "@/features/prototype/brief";
import { profileEntries } from "@/features/prototype/sample-home";
import { sampleTrip } from "@/features/prototype/sample-trip";
import { write } from "@/features/prototype/session-store";

import { CommitmentsPanel } from "./commitments-panel";
import {
  buttonLarge,
  chip,
  eyebrow,
  fieldLarge,
  pageTitle,
  quiet,
  quietLarge,
} from "./styles";

const input = `${fieldLarge} mt-1 block w-full`;
const error = "mt-1 font-sans text-xs font-semibold text-stamp";

function Chips({
  label,
  options,
  selected,
  source,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  source?: string;
  onToggle: (value: string) => void;
}) {
  // Answers carried in from the profile may not be among the stock options.
  const all = [...options, ...selected.filter((v) => !options.includes(v))];
  return (
    <fieldset>
      <legend className="text-[19px] font-medium">
        {label}
        {source && (
          <span className="ml-2 font-sans text-xs font-normal italic">
            {source}
          </span>
        )}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {all.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={selected.includes(option)}
            onClick={() => onToggle(option)}
            className={chip}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const toggleIn = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];

export function TripBrief() {
  const router = useRouter();
  const [{ brief: prefilled, sources }] = useState(() =>
    prefillFromProfile(emptyBrief(), profileEntries),
  );
  const [brief, setBrief] = useState<Brief>(prefilled);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [builtDays, setBuiltDays] = useState<number | null>(null);

  const set = (patch: Partial<Brief>) =>
    setBrief((current) => ({ ...current, ...patch }));
  const errors = validateBrief(brief);
  const hasCity = brief.cities.some((city) => city.name.trim() !== "");
  // A prefilled answer keeps its source label until the traveller changes it.
  const sourceOf = (key: "pace" | "food" | "gettingAround" | "stay") =>
    JSON.stringify(brief[key]) === JSON.stringify(prefilled[key])
      ? sources[key]
      : undefined;

  useEffect(() => {
    if (builtDays === null) return;
    if (builtDays >= sampleTrip.days.length) {
      router.push("/prototype/trip?built=1");
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(
      () => setBuiltDays((days) => (days ?? 0) + 1),
      still ? 0 : 600,
    );
    return () => clearTimeout(timer);
  }, [builtDays, router]);

  function next() {
    if (step === 0 && !canBuild(brief)) {
      setTried(true);
      return;
    }
    setStep((current) => Math.min(current + 1, BRIEF_STEPS.length - 1));
  }

  function build() {
    if (!canBuild(brief)) {
      setTried(true);
      setStep(0);
      return;
    }
    write(null); // start the workspace from a freshly built trip
    setBuiltDays(0);
  }

  if (builtDays !== null) {
    return (
      <div className="mx-auto max-w-2xl py-10 md:py-14" aria-live="polite">
        <h1 className={pageTitle}>Building your trip</h1>
        <p className="mt-3 text-lg text-ink/75 italic">
          One day at a time. You can leave and come back; I keep what is built.
        </p>
        <ol className="mt-6 space-y-2">
          {sampleTrip.days.map((day) => (
            <li
              key={day.day}
              className="rounded-lg bg-card shadow-[0_0_0_1px_rgb(29_26_22/0.12)] px-4 py-3"
            >
              Day {day.day} · {day.date}:{" "}
              {day.day <= builtDays ? `Day ${day.day} built` : "working on it…"}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-10 md:py-14">
      <h1 className={pageTitle}>Quick plan</h1>
      <p className="mt-3 text-lg text-ink/75 italic">
        A short trip brief. Only the first step is needed; I fill the rest from
        what I remember, and tell you what I assumed.
      </p>

      <p className={`${eyebrow} mt-6`} data-qa="brief-progress">
        Step {step + 1} of {BRIEF_STEPS.length}: {BRIEF_STEPS[step]}
      </p>
      <div aria-hidden className="mt-2 flex gap-1">
        {BRIEF_STEPS.map((name, index) => (
          <span
            key={name}
            className={`h-[3px] flex-1 rounded-full ${index <= step ? "bg-ink" : "bg-ink/12"}`}
          />
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {step === 0 && (
          <>
            <fieldset className="space-y-3">
              <legend className="text-[19px] font-medium">
                Where are you going?
              </legend>
              {brief.cities.map((city, index) => (
                <div key={index} className="flex flex-wrap items-end gap-3">
                  <label className="min-w-40 flex-1 text-sm">
                    City {index + 1}
                    <input
                      value={city.name}
                      onChange={(event) =>
                        set({
                          cities: brief.cities.map((c, i) =>
                            i === index
                              ? { ...c, name: event.target.value }
                              : c,
                          ),
                        })
                      }
                      className={input}
                    />
                  </label>
                  <label className="w-28 text-sm">
                    Nights in city {index + 1}
                    <input
                      type="number"
                      min={1}
                      value={city.nights}
                      onChange={(event) =>
                        set({
                          cities: brief.cities.map((c, i) =>
                            i === index
                              ? { ...c, nights: Number(event.target.value) }
                              : c,
                          ),
                        })
                      }
                      className={input}
                    />
                  </label>
                  {brief.cities.length > 1 && (
                    <button
                      type="button"
                      className={quiet}
                      aria-label={`Remove city ${index + 1}`}
                      onClick={() =>
                        set({
                          cities: brief.cities.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {tried && !hasCity && (
                <p className={error}>Add at least one city.</p>
              )}
              {errors.cities && <p className={error}>{errors.cities}</p>}
              <button
                type="button"
                className={quiet}
                onClick={() =>
                  set({ cities: [...brief.cities, { name: "", nights: 1 }] })
                }
              >
                Add another city
              </button>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Start date
                <input
                  type="date"
                  value={brief.startDate ?? ""}
                  onChange={(event) =>
                    set({ startDate: event.target.value || null })
                  }
                  className={input}
                />
                {tried && !brief.startDate && (
                  <span className={`${error} block`}>Choose a start date.</span>
                )}
              </label>
              <label className="text-sm">
                Leaving on (optional)
                <input
                  type="date"
                  value={brief.endDate ?? ""}
                  onChange={(event) =>
                    set({ endDate: event.target.value || null })
                  }
                  className={input}
                />
                {errors.endDate && (
                  <span className={`${error} block`}>{errors.endDate}</span>
                )}
              </label>
              <label className="text-sm">
                Travellers
                <input
                  type="number"
                  min={1}
                  value={brief.travellers}
                  onChange={(event) =>
                    set({ travellers: Number(event.target.value) })
                  }
                  className={input}
                />
                {errors.travellers && (
                  <span className={`${error} block`}>{errors.travellers}</span>
                )}
              </label>
              <label className="text-sm">
                Of whom children
                <input
                  type="number"
                  min={0}
                  value={brief.children}
                  onChange={(event) =>
                    set({ children: Number(event.target.value) })
                  }
                  className={input}
                />
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="italic">
              Anything already booked or decided. I plan around these and never
              move them. Skip this if nothing is fixed yet.
            </p>
            <CommitmentsPanel initial={sampleTrip.commitments} />
          </>
        )}

        {step === 2 && (
          <>
            <Chips
              label="What is this trip for?"
              options={[
                "Holiday",
                "Honeymoon or anniversary",
                "Family visit",
                "Trip with friends",
                "Time alone",
                "Work and leisure",
              ]}
              selected={brief.purpose ? [brief.purpose] : []}
              onToggle={(value) =>
                set({ purpose: brief.purpose === value ? null : value })
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Budget for the trip (optional)
                <input
                  type="number"
                  min={0}
                  value={brief.budget ?? ""}
                  onChange={(event) =>
                    set({
                      budget: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  className={input}
                />
              </label>
              <label className="text-sm">
                Currency
                <select
                  value={brief.currency}
                  onChange={(event) => set({ currency: event.target.value })}
                  className={input}
                >
                  {["USD", "EUR", "GBP", "JPY"].map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>
            <Chips
              label="How firm are your dates?"
              options={["Fixed", "Can move"]}
              selected={
                brief.datesFirm === null
                  ? []
                  : [brief.datesFirm ? "Fixed" : "Can move"]
              }
              onToggle={(value) => set({ datesFirm: value === "Fixed" })}
            />
            <Chips
              label="How firm is your budget?"
              options={["Fixed", "Can stretch"]}
              selected={
                brief.budgetFirm === null
                  ? []
                  : [brief.budgetFirm ? "Fixed" : "Can stretch"]
              }
              onToggle={(value) => set({ budgetFirm: value === "Fixed" })}
            />
          </>
        )}

        {step === 3 && (
          <>
            <p className="italic">
              I have filled in what I remember. Changing an answer here affects
              only this trip.
            </p>
            <Chips
              label="How packed should the days be?"
              options={["packed", "balanced", "relaxed"]}
              selected={brief.pace ? [brief.pace] : []}
              source={sourceOf("pace")}
              onToggle={(value) =>
                set({
                  pace: brief.pace === value ? null : (value as Brief["pace"]),
                })
              }
            />
            <Chips
              label="What do you enjoy?"
              options={[
                "Museums and exhibitions",
                "Nature and activities",
                "Food",
                "Shopping",
                "Nightlife",
                "Architecture",
                "Markets",
              ]}
              selected={brief.interests}
              onToggle={(value) =>
                set({ interests: toggleIn(brief.interests, value) })
              }
            />
            <Chips
              label="Food rules and allergies"
              options={["Vegetarian", "Vegan", "Halal", "Gluten-free"]}
              selected={brief.food}
              source={sourceOf("food")}
              onToggle={(value) => set({ food: toggleIn(brief.food, value) })}
            />
            <Chips
              label="Getting around"
              options={["Walking", "Public transport", "Taxis", "Hire car"]}
              selected={brief.gettingAround ? [brief.gettingAround] : []}
              source={sourceOf("gettingAround")}
              onToggle={(value) =>
                set({
                  gettingAround: brief.gettingAround === value ? null : value,
                })
              }
            />
            <Chips
              label="Where you like to stay"
              options={[
                "Small hotel",
                "Large hotel",
                "Apartment",
                "Guesthouse",
              ]}
              selected={brief.stay ? [brief.stay] : []}
              source={sourceOf("stay")}
              onToggle={(value) =>
                set({ stay: brief.stay === value ? null : value })
              }
            />
          </>
        )}

        {step === 4 && (
          <>
            {briefSections(brief).map((section) => (
              <section
                key={section.step}
                className="rounded-lg bg-card shadow-[0_0_0_1px_rgb(29_26_22/0.12)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className={eyebrow}>{BRIEF_STEPS[section.step]}</h2>
                  <button
                    type="button"
                    className={quiet}
                    aria-label={`Edit ${BRIEF_STEPS[section.step]}`}
                    onClick={() => setStep(section.step)}
                  >
                    Edit
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {section.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ))}
            <label className="block text-sm">
              Anything else I should know?
              <textarea
                rows={3}
                value={brief.anythingElse}
                onChange={(event) => set({ anythingElse: event.target.value })}
                className={input}
              />
              <span className="mt-1 block text-xs italic">
                In the finished product I show how I understood this before I
                use it.
              </span>
            </label>
          </>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            className={quietLarge}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
        )}
        {step < BRIEF_STEPS.length - 1 ? (
          <button type="button" className={buttonLarge} onClick={next}>
            Next
          </button>
        ) : (
          <button type="button" className={buttonLarge} onClick={build}>
            Build my trip
          </button>
        )}
        <Link href="/prototype/trip" className={`ml-auto ${quietLarge}`}>
          Talk it through instead
        </Link>
      </div>
    </div>
  );
}

"use client";

import { Save, X } from "lucide-react";
import { useState } from "react";
import type {
  accommodationTypeOptions,
  budgetLevelOptions,
  customPreferenceSuggestionOptions,
  paceOptions,
  transportationModeOptions,
  travelMvpInterestOptions,
} from "@/features/preferences/schemas";
import type { TripPreferenceDto } from "@/features/preferences/types";

type Option = {
  value: string;
  label: string;
};

type PreferenceFormProps = {
  tripId: string;
  preference: TripPreferenceDto | null;
  defaultPace: string | null;
  saved: boolean;
  error?: string;
  returnTo?: "preferences" | "settings";
  action: (formData: FormData) => void | Promise<void>;
  options: {
    budgetLevels: typeof budgetLevelOptions;
    paces: typeof paceOptions;
    interests: typeof travelMvpInterestOptions;
    transportationModes: typeof transportationModeOptions;
    accommodationTypes: typeof accommodationTypeOptions;
    customPreferenceSuggestions: typeof customPreferenceSuggestionOptions;
  };
};

function fieldClasses() {
  return "mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-500";
}

function textareaClasses() {
  return "mt-2 min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-500";
}

function checked(value: string, values: readonly string[]) {
  return values.includes(value);
}

function textListValue(values: readonly string[]) {
  return values.join("\n");
}

function normalizePreferenceLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function addPreferenceValue(values: readonly string[], value: string) {
  const normalized = normalizePreferenceLabel(value);

  if (!normalized) {
    return [...values];
  }

  const exists = values.some(
    (item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  );

  return exists ? [...values] : [...values, normalized];
}

function CheckboxGroup({
  name,
  options,
  values,
}: {
  name: string;
  options: readonly Option[];
  values: readonly string[];
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-800"
        >
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={checked(option.value, values)}
            className="size-4 rounded border-zinc-300"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function CustomPreferenceBoxes({
  values,
  suggestions,
}: {
  values: readonly string[];
  suggestions: readonly string[];
}) {
  const [customPreferences, setCustomPreferences] = useState([...values]);
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizePreferenceLabel(query);
  const matches = normalizedQuery
    ? suggestions.filter((option) =>
        option.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()),
      )
    : [];

  function addValue(value: string) {
    setCustomPreferences((current) => addPreferenceValue(current, value));
    setQuery("");
  }

  function removeValue(value: string) {
    setCustomPreferences((current) => current.filter((item) => item !== value));
  }

  return (
    <div>
      <label className="text-sm font-medium text-zinc-800">
        Custom preferences
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or add a preference"
          className={fieldClasses()}
        />
      </label>
      {normalizedQuery ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {matches.length > 0 ? (
            matches.map((match) => (
              <button
                key={match}
                type="button"
                onClick={() => addValue(match)}
                className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
              >
                {match}
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => addValue(normalizedQuery)}
              className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
            >
              Add &quot;{normalizedQuery}&quot;
            </button>
          )}
        </div>
      ) : null}
      {customPreferences.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {customPreferences.map((preference) => (
            <span
              key={preference}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 text-xs font-medium text-zinc-800"
            >
              <input type="hidden" name="customPreferences" value={preference} />
              {preference}
              <button
                type="button"
                onClick={() => removeValue(preference)}
                aria-label={`Remove ${preference}`}
                className="-mr-1 inline-flex size-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-950"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PreferenceForm({
  tripId,
  preference,
  defaultPace,
  saved,
  error,
  returnTo = "preferences",
  action,
  options,
}: PreferenceFormProps) {
  const [hotelPriority, setHotelPriority] = useState(
    preference?.hotelPriority ?? 5,
  );
  const [walkingTolerance, setWalkingTolerance] = useState(
    preference?.walkingToleranceKm ?? 5,
  );

  return (
    <form action={action} className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <p className="text-sm font-medium text-zinc-500">Trip preferences</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          Shape your planning profile
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          These details personalize recommendations for this trip and become the
          first signal for future learning features.
        </p>
      </div>

      {saved ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Preferences saved.
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Check the required preference fields and try again.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6">
        <section className="grid gap-4 rounded-md border border-zinc-200 p-4">
          <h2 className="text-base font-semibold text-zinc-950">Core profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-800">
              Budget level
              <select
                required
                name="budgetLevel"
                defaultValue={preference?.budgetLevel ?? ""}
                className={fieldClasses()}
              >
                <option value="">Select</option>
                {options.budgetLevels.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-800">
              Pace
              <select
                required
                name="pace"
                defaultValue={preference?.pace ?? defaultPace ?? ""}
                className={fieldClasses()}
              >
                <option value="">Select</option>
                {options.paces.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-800">Interests</p>
            <CheckboxGroup
              name="interests"
              options={options.interests}
              values={preference?.interests ?? []}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-800">Transportation</p>
            <CheckboxGroup
              name="transportationModes"
              options={options.transportationModes}
              values={preference?.transportationModes ?? []}
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-md border border-zinc-200 p-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Comfort and lodging
          </h2>
          <div>
            <p className="text-sm font-medium text-zinc-800">
              Accommodation types
            </p>
            <CheckboxGroup
              name="accommodationTypes"
              options={options.accommodationTypes}
              values={preference?.accommodationTypes ?? []}
            />
          </div>
          <label className="text-sm font-medium text-zinc-800">
            Hotel priority: {hotelPriority}/10
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              name="hotelPriority"
              value={hotelPriority}
              onChange={(event) => setHotelPriority(Number(event.target.value))}
              className="mt-3 w-full accent-zinc-950"
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Walking tolerance: {walkingTolerance} km
            <input
              type="range"
              min="0.5"
              max="25"
              step="0.5"
              name="walkingToleranceKm"
              value={walkingTolerance}
              onChange={(event) =>
                setWalkingTolerance(Number(event.target.value))
              }
              className="mt-3 w-full accent-zinc-950"
            />
          </label>
        </section>

        <section className="grid gap-4 rounded-md border border-zinc-200 p-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Extra signals
          </h2>
          <label className="text-sm font-medium text-zinc-800">
            Dietary restrictions
            <textarea
              name="dietaryRestrictions"
              defaultValue={textListValue(preference?.dietaryRestrictions ?? [])}
              className={textareaClasses()}
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Accessibility needs
            <textarea
              name="accessibilityNeeds"
              defaultValue={textListValue(preference?.accessibilityNeeds ?? [])}
              className={textareaClasses()}
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Must avoid
            <textarea
              name="mustAvoid"
              defaultValue={textListValue(preference?.mustAvoid ?? [])}
              className={textareaClasses()}
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Custom notes
            <textarea
              name="customNotes"
              defaultValue={preference?.customNotes ?? ""}
              className={textareaClasses()}
            />
          </label>
          <CustomPreferenceBoxes
            values={preference?.customPreferences ?? []}
            suggestions={options.customPreferenceSuggestions}
          />
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          <Save aria-hidden="true" className="size-4" />
          Save preferences
        </button>
      </div>
    </form>
  );
}

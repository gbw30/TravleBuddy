"use client";

import { useMemo, useState } from "react";
import {
  getContinueTripCreationMissingRequirements,
  supportedBudgetCurrencies,
} from "@/features/trips/schemas";
import {
  getTripLocationsForCountry,
  tripLocationCountries,
} from "@/features/trips/location-catalog";

type DestinationRow = {
  id: number;
  city: string;
  country: string;
};

type NewTripFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

function fieldClasses() {
  return "mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-500";
}

function selectOptionsForCountry(country: string) {
  return country ? getTripLocationsForCountry(country) : [];
}

function focusFirstMissingField(missing: string[]) {
  const fieldByRequirement: Record<string, string> = {
    "trip title": "title",
    "at least one destination": "destinationCountry",
    "valid date range": "startDate",
    "trip-level budget amount and currency": "budgetAmount",
    "travel style": "travelStyle",
  };
  const fieldName = fieldByRequirement[missing[0]];

  if (!fieldName) {
    return;
  }

  document.querySelector<HTMLElement>(`[name="${fieldName}"]`)?.focus();
}

export function NewTripForm({ action }: NewTripFormProps) {
  const [title, setTitle] = useState("");
  const [departureCountry, setDepartureCountry] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [destinations, setDestinations] = useState<DestinationRow[]>([
    { id: 1, city: "", country: "" },
  ]);
  const [nextDestinationId, setNextDestinationId] = useState(2);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("");
  const [travelStyle, setTravelStyle] = useState("");
  const [showMissing, setShowMissing] = useState(false);

  const missingRequirements = useMemo(
    () =>
      getContinueTripCreationMissingRequirements({
        title,
        destinations,
        startDate,
        endDate,
        budgetAmount,
        budgetCurrency,
        travelStyle,
      }),
    [
      budgetAmount,
      budgetCurrency,
      destinations,
      endDate,
      startDate,
      title,
      travelStyle,
    ],
  );
  const canContinue = missingRequirements.length === 0;

  function updateDestination(
    rowId: number,
    updates: Partial<Omit<DestinationRow, "id">>,
  ) {
    setDestinations((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    );
  }

  return (
    <form
      action={action}
      className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-sm font-medium text-zinc-500">Trip details</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">
          Create a trip
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Save a named trip as a draft, or complete the required fields to
          continue into planning.
        </p>
      </div>

      <div className="mt-6 grid gap-5">
        <label className="text-sm font-medium text-zinc-800">
          Title
          <input
            required
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoComplete="off"
            placeholder="European summer route"
            className={fieldClasses()}
          />
        </label>

        <fieldset className="grid gap-4 rounded-md border border-zinc-200 p-4">
          <legend className="px-1 text-sm font-medium text-zinc-800">
            Departure
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-800">
              Country
              <select
                name="departureCountry"
                value={departureCountry}
                onChange={(event) => {
                  setDepartureCountry(event.target.value);
                  setDepartureCity("");
                }}
                className={fieldClasses()}
              >
                <option value="">Not set</option>
                {tripLocationCountries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-800">
              City
              <select
                name="departureCity"
                value={departureCity}
                onChange={(event) => setDepartureCity(event.target.value)}
                className={fieldClasses()}
              >
                <option value="">Not set</option>
                {selectOptionsForCountry(departureCountry).map((location) => (
                  <option key={location.city} value={location.city}>
                    {location.city}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 rounded-md border border-zinc-200 p-4">
          <legend className="px-1 text-sm font-medium text-zinc-800">
            Destinations
          </legend>
          {destinations.map((destination, index) => (
            <div key={destination.id} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-sm font-medium text-zinc-800">
                Country {index + 1}
                <select
                  name="destinationCountry"
                  value={destination.country}
                  onChange={(event) =>
                    updateDestination(destination.id, {
                      country: event.target.value,
                      city: "",
                    })
                  }
                  className={fieldClasses()}
                >
                  <option value="">Select</option>
                  {tripLocationCountries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-zinc-800">
                City {index + 1}
                <select
                  name="destinationCity"
                  value={destination.city}
                  onChange={(event) =>
                    updateDestination(destination.id, {
                      city: event.target.value,
                    })
                  }
                  className={fieldClasses()}
                >
                  <option value="">Select</option>
                  {selectOptionsForCountry(destination.country).map((location) => (
                    <option key={location.city} value={location.city}>
                      {location.city}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  setDestinations((rows) =>
                    rows.length > 1
                      ? rows.filter((row) => row.id !== destination.id)
                      : rows,
                  )
                }
                className="mt-7 inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setDestinations((rows) => [
                ...rows,
                { id: nextDestinationId, city: "", country: "" },
              ]);
              setNextDestinationId((value) => value + 1);
            }}
            className="inline-flex h-10 w-fit items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            Add destination
          </button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-zinc-800">
            Start date
            <input
              type="date"
              name="startDate"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={fieldClasses()}
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            End date
            <input
              type="date"
              name="endDate"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={fieldClasses()}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <label className="text-sm font-medium text-zinc-800">
            Budget amount
            <input
              type="number"
              min="1"
              step="0.01"
              name="budgetAmount"
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(event.target.value)}
              className={fieldClasses()}
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Currency
            <select
              name="budgetCurrency"
              value={budgetCurrency}
              onChange={(event) => setBudgetCurrency(event.target.value)}
              className={fieldClasses()}
            >
              <option value="">Select</option>
              {supportedBudgetCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm font-medium text-zinc-800">
          Travel style
          <select
            name="travelStyle"
            value={travelStyle}
            onChange={(event) => setTravelStyle(event.target.value)}
            className={fieldClasses()}
          >
            <option value="">Not set</option>
            <option value="RELAXED">Relaxed</option>
            <option value="BALANCED">Balanced</option>
            <option value="PACKED">Packed</option>
          </select>
        </label>
      </div>

      {showMissing && missingRequirements.length > 0 ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Complete these fields to continue:</p>
          <ul className="mt-2 grid gap-1">
            {missingRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="draft"
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
        >
          Save as draft
        </button>
        <button
          type="submit"
          name="intent"
          value="continue"
          aria-disabled={!canContinue}
          onClick={(event) => {
            if (!canContinue) {
              event.preventDefault();
              setShowMissing(true);
              focusFirstMissingField(missingRequirements);
            }
          }}
          className={
            canContinue
              ? "inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              : "inline-flex h-10 items-center rounded-md bg-zinc-300 px-4 text-sm font-medium text-zinc-600"
          }
        >
          Continue trip creation
        </button>
      </div>
    </form>
  );
}

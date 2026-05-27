import { Trash2 } from "lucide-react";
import {
  deleteTripFormAction,
  updateTripSettingsFormAction,
} from "@/features/trips/actions";
import {
  supportedBudgetCurrencies,
  type TravelStyle,
} from "@/features/trips/schemas";
import {
  tripLocationCatalog,
  tripLocationCountries,
} from "@/features/trips/location-catalog";
import type { TripDto } from "@/features/trips/types";

function dateInputValue(value?: string | Date | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function fieldClasses() {
  return "mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-500";
}

export function TripSettingsForm({ trip }: { trip: TripDto }) {
  const destinationRows =
    trip.destinations && trip.destinations.length > 0
      ? [
          ...trip.destinations,
          {
            id: "new-destination",
            city: "",
            country: "",
            region: null,
            sortOrder: trip.destinations.length,
            timeZone: null,
          },
        ]
      : [
          {
            id: "new-destination",
            city: "",
            country: "",
            region: null,
            sortOrder: 0,
            timeZone: null,
          },
        ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        action={updateTripSettingsFormAction}
        className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="tripId" value={trip.id} />
        <div>
          <p className="text-sm font-medium text-zinc-500">Trip settings</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            Edit trip details
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Complete destination, dates, and budget to unlock full planning.
          </p>
        </div>

        <div className="mt-6 grid gap-5">
          <label className="text-sm font-medium text-zinc-800">
            Title
            <input
              required
              name="title"
              defaultValue={trip.title}
              className={fieldClasses()}
            />
          </label>

          <fieldset className="grid gap-4 rounded-md border border-zinc-200 p-4">
            <legend className="px-1 text-sm font-medium text-zinc-800">
              Departure
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-zinc-800">
                Departure country
                <select
                  name="departureCountry"
                  defaultValue={trip.departureCountry ?? ""}
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
                Departure city
                <select
                  name="departureCity"
                  defaultValue={trip.departureCity ?? ""}
                  className={fieldClasses()}
                >
                  <option value="">Not set</option>
                  {tripLocationCatalog.map((location) => (
                    <option
                      key={`${location.country}-${location.city}`}
                      value={location.city}
                    >
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
            {destinationRows.map((destination, index) => (
              <div key={destination.id} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-zinc-800">
                  Destination country {index + 1}
                  <select
                    name="destinationCountry"
                    defaultValue={destination.country}
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
                  Destination city {index + 1}
                  <select
                    name="destinationCity"
                    defaultValue={destination.city}
                    className={fieldClasses()}
                  >
                    <option value="">Select</option>
                    {tripLocationCatalog.map((location) => (
                      <option
                        key={`${location.country}-${location.city}`}
                        value={location.city}
                      >
                        {location.city}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-800">
              Start date
              <input
                type="date"
                name="startDate"
                defaultValue={dateInputValue(trip.startDate)}
                className={fieldClasses()}
              />
            </label>
            <label className="text-sm font-medium text-zinc-800">
              End date
              <input
                type="date"
                name="endDate"
                defaultValue={dateInputValue(trip.endDate)}
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
                defaultValue={trip.budgetAmount ?? ""}
                className={fieldClasses()}
              />
            </label>
            <label className="text-sm font-medium text-zinc-800">
              Currency
              <select
                name="budgetCurrency"
                defaultValue={trip.budgetCurrency ?? ""}
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
              defaultValue={(trip.travelStyle as TravelStyle | null) ?? ""}
              className={fieldClasses()}
            >
              <option value="">Not set</option>
              <option value="RELAXED">Relaxed</option>
              <option value="BALANCED">Balanced</option>
              <option value="PACKED">Packed</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Save changes
          </button>
        </div>
      </form>

      <aside className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-red-950">Delete trip</h2>
        <p className="mt-2 text-sm leading-6 text-red-700">
          This removes the trip and all related planning records owned by it.
        </p>
        <form action={deleteTripFormAction} className="mt-5">
          <input type="hidden" name="tripId" value={trip.id} />
          <label className="mb-4 flex items-start gap-2 text-sm leading-6 text-red-800">
            <input
              required
              type="checkbox"
              name="confirmDelete"
              className="mt-1 size-4 rounded border-red-300"
            />
            I understand this trip will be permanently deleted.
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete trip
          </button>
        </form>
      </aside>
    </div>
  );
}

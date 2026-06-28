"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { SuggestionCategory } from "@/generated/prisma/client";
import type { PlanningTopic } from "@/features/recommendations/types";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type DestinationOption = {
  id: string;
  city: string;
  country: string;
};

type AlreadyDecidedPlaceFormProps = {
  tripId: string;
  activeTopic: PlanningTopic;
  budgetCurrency: string | null;
  destinations: DestinationOption[];
  activeDestinationId?: string | null;
  planningDayNumber?: number | null;
  action: (formData: FormData) => void | Promise<void>;
};

const categoryOptions = [
  "HOTEL",
  "ATTRACTION",
  "RESTAURANT",
  "ACTIVITY",
  "LANDMARK",
  "ENTERTAINMENT",
] as const satisfies readonly SuggestionCategory[];

const maxCustomPlaceEstimatedCost = 999_999.99;

function fieldClasses() {
  return "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500";
}

function uniqueValues(values: readonly string[]) {
  return Array.from(new Set(values)).filter(Boolean);
}

export function AlreadyDecidedPlaceForm({
  tripId,
  activeTopic,
  budgetCurrency,
  destinations,
  activeDestinationId,
  planningDayNumber,
  action,
}: AlreadyDecidedPlaceFormProps) {
  const initialDestination =
    destinations.find((destination) => destination.id === activeDestinationId) ??
    destinations[0];
  const countries = useMemo(
    () => uniqueValues(destinations.map((destination) => destination.country)),
    [destinations],
  );
  const [category, setCategory] = useState<SuggestionCategory>("ATTRACTION");
  const [city, setCity] = useState(initialDestination?.city ?? "");
  const [country, setCountry] = useState(initialDestination?.country ?? "");
  const [estimatedCostAmount, setEstimatedCostAmount] = useState("");

  function handleCityChange(nextCity: string) {
    setCity(nextCity);

    const destination = destinations.find((item) => item.city === nextCity);

    if (destination) {
      setCountry(destination.country);
    }
  }

  return (
    <form action={action} className="mt-4 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="topic" value={activeTopic} />
      <input type="hidden" name="destinationId" value={initialDestination?.id ?? ""} />
      <input type="hidden" name="planningDayNumber" value={planningDayNumber ?? ""} />
      <input type="hidden" name="estimatedCostCurrency" value={budgetCurrency ?? ""} />
      <input
        name="name"
        required
        className={fieldClasses()}
        placeholder="Place name"
      />
      <select
        name="category"
        className={fieldClasses()}
        value={category}
        onChange={(event) =>
          setCategory(event.target.value as SuggestionCategory)
        }
      >
        {categoryOptions.map((option) => (
          <option key={option} value={option}>
            {option.toLocaleLowerCase().replace("_", " ")}
          </option>
        ))}
      </select>
      <select
        name="city"
        required
        value={city}
        onChange={(event) => handleCityChange(event.target.value)}
        className={fieldClasses()}
      >
        <option value="">City</option>
        {destinations.map((destination) => (
          <option
            key={`${destination.country}-${destination.city}`}
            value={destination.city}
          >
            {destination.city}
          </option>
        ))}
      </select>
      <select
        name="country"
        required
        value={country}
        onChange={(event) => setCountry(event.target.value)}
        className={fieldClasses()}
      >
        <option value="">Country</option>
        {countries.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <input
        name="estimatedCostAmount"
        type="number"
        min="0"
        max={maxCustomPlaceEstimatedCost}
        step="1"
        inputMode="decimal"
        value={estimatedCostAmount}
        onChange={(event) => setEstimatedCostAmount(event.target.value)}
        className={fieldClasses()}
        placeholder={`Estimated cost${budgetCurrency ? ` (${budgetCurrency})` : ""}`}
      />
      <textarea
        name="note"
        rows={2}
        className={`${fieldClasses()} md:col-span-2`}
        placeholder="Why this place matters"
      />
      <PendingSubmitButton
        pendingLabel="Adding..."
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:w-fit"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add place
      </PendingSubmitButton>
    </form>
  );
}

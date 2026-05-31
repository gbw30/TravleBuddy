import type { PreferenceTripSummary, TripPreferenceDto } from "@/features/preferences/types";

function listValue(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "Not set";
}

function optionalValue(value: string | number | null) {
  return value === null || value === "" ? "Not set" : value;
}

export function PreferenceSummary({
  trip,
  preference,
}: {
  trip: PreferenceTripSummary;
  preference: TripPreferenceDto | null;
}) {
  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">Preference summary</p>
      <h2 className="mt-2 text-lg font-semibold text-zinc-950">{trip.title}</h2>
      <div className="mt-5 grid gap-4 text-sm">
        <div>
          <p className="font-medium text-zinc-800">Core profile</p>
          <dl className="mt-2 grid gap-2 text-zinc-600">
            <div className="flex justify-between gap-4">
              <dt>Budget amount</dt>
              <dd className="font-medium text-zinc-900">
                {trip.budgetAmount && trip.budgetCurrency
                  ? `${trip.budgetCurrency} ${trip.budgetAmount}`
                  : "Not set"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Comfort target</dt>
              <dd className="font-medium text-zinc-900">
                {optionalValue(preference?.budgetLevel ?? null)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Pace</dt>
              <dd className="font-medium text-zinc-900">
                {optionalValue(preference?.pace ?? trip.travelStyle)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Interests</dt>
              <dd className="text-right font-medium text-zinc-900">
                {preference ? preference.interests.length : 0}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Transport modes</dt>
              <dd className="text-right font-medium text-zinc-900">
                {preference ? preference.transportationModes.length : 0}
              </dd>
            </div>
          </dl>
        </div>
        <div className="border-t border-zinc-200 pt-4">
          <p className="font-medium text-zinc-800">Recommendation signals</p>
          <dl className="mt-2 grid gap-2 text-zinc-600">
            <div>
              <dt>Interests</dt>
              <dd className="mt-1 text-zinc-900">
                {listValue(preference?.interests ?? [])}
              </dd>
            </div>
            <div>
              <dt>Custom preferences</dt>
              <dd className="mt-1 text-zinc-900">
                {listValue(preference?.customPreferences ?? [])}
              </dd>
            </div>
            <div>
              <dt>Must avoid</dt>
              <dd className="mt-1 text-zinc-900">
                {listValue(preference?.mustAvoid ?? [])}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Hotel priority</dt>
              <dd className="font-medium text-zinc-900">
                {optionalValue(preference?.hotelPriority ?? null)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Walking tolerance</dt>
              <dd className="font-medium text-zinc-900">
                {preference?.walkingToleranceKm
                  ? `${preference.walkingToleranceKm} km`
                  : "Not set"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </aside>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { getTripByIdForUser } from "@/features/trips/queries";
import { TripSettingsForm } from "@/components/trips/trip-settings-form";
import { getTripPreferenceForUser } from "@/features/preferences/queries";
import {
  accommodationTypeOptions,
  budgetLevelOptions,
  customPreferenceSuggestionOptions,
  paceOptions,
  transportationModeOptions,
  travelMvpInterestOptions,
} from "@/features/preferences/schemas";
import { saveTripPreferenceFormAction } from "@/features/preferences/actions";
import { PreferenceForm } from "@/components/preferences/preference-form";
import { PreferenceSummary } from "@/components/preferences/preference-summary";

type TripSettingsPageProps = {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    saved?: string;
    tab?: string;
  }>;
};

function tabLinkClasses(active: boolean) {
  return active
    ? "inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white"
    : "inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-white";
}

export default async function TripSettingsPage({
  params,
  searchParams,
}: TripSettingsPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const query = await searchParams;
  const activeTab = query?.tab === "preferences" ? "preferences" : "details";
  const [trip, preferenceResult] = await Promise.all([
    getTripByIdForUser(userId, tripId),
    getTripPreferenceForUser(userId, tripId),
  ]);

  if (!trip) {
    notFound();
  }

  if (preferenceResult.status === "not_found") {
    notFound();
  }

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {query?.error === "invalid" ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Check the trip details. Destination, dates, and budget must be
            provided as complete pairs.
          </div>
        ) : null}
        {query?.error === "confirm-delete" ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Confirm deletion before removing this trip.
          </div>
        ) : null}
        {query?.error === "archived" ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Archived trips cannot be edited or deleted in Stage 4.
          </div>
        ) : null}
        <nav className="mb-6 flex flex-wrap gap-3" aria-label="Trip settings">
          <Link
            href={`/trips/${trip.id}/settings`}
            className={tabLinkClasses(activeTab === "details")}
          >
            Details
          </Link>
          <Link
            href={`/trips/${trip.id}/settings?tab=preferences`}
            className={tabLinkClasses(activeTab === "preferences")}
          >
            Preferences
          </Link>
        </nav>

        {activeTab === "details" ? (
          <TripSettingsForm trip={trip} />
        ) : preferenceResult.status === "ok" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <PreferenceForm
              tripId={trip.id}
              preference={preferenceResult.preference}
              defaultPace={trip.travelStyle ?? null}
              saved={query?.saved === "1"}
              error={query?.error}
              returnTo="settings"
              action={saveTripPreferenceFormAction}
              options={{
                budgetLevels: budgetLevelOptions,
                paces: paceOptions,
                interests: travelMvpInterestOptions,
                transportationModes: transportationModeOptions,
                accommodationTypes: accommodationTypeOptions,
                customPreferenceSuggestions: customPreferenceSuggestionOptions,
              }}
            />
            <PreferenceSummary
              trip={preferenceResult.trip}
              preference={preferenceResult.preference}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">
              Trip preferences
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Preferences are locked
            </h1>
            {preferenceResult.status === "archived" ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Archived trips cannot update the preference profile in this
                phase.
              </p>
            ) : preferenceResult.status === "not_ready" ? (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Complete the trip details before editing preferences.
                </p>
                <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
                  {preferenceResult.missingRequirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

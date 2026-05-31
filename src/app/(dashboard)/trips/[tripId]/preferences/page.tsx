import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { getTripByIdForUser } from "@/features/trips/queries";
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

type TripPreferencesPageProps = {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{
    saved?: string;
    error?: string;
  }>;
};

export default async function TripPreferencesPage({
  params,
  searchParams,
}: TripPreferencesPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const query = await searchParams;
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

  const isLocked = preferenceResult.status !== "ok";
  const missing =
    preferenceResult.status === "not_ready"
      ? preferenceResult.missingRequirements
      : [];

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {!isLocked ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <PreferenceForm
              tripId={trip.id}
              preference={preferenceResult.preference}
              budgetAmount={preferenceResult.trip.budgetAmount}
              budgetCurrency={preferenceResult.trip.budgetCurrency}
              defaultPace={trip.travelStyle ?? null}
              saved={query?.saved === "1"}
              error={query?.error}
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
              {trip.title}
            </h1>
            {preferenceResult.status === "archived" ? (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Archived trips cannot update the preference profile in this
                  phase.
                </p>
                <Link
                  href={`/trips/${trip.id}`}
                  className="mt-6 inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
                >
                  Back to trip overview
                </Link>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  This trip needs complete planning details before the
                  preference questionnaire can begin.
                </p>
                <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
                  {missing.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
                <Link
                  href={`/trips/${trip.id}/settings`}
                  className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Complete trip details
                </Link>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

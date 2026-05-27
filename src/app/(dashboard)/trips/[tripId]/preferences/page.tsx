import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { getTripByIdForUser } from "@/features/trips/queries";
import { getContinueTripCreationMissingRequirements } from "@/features/trips/schemas";

type TripPreferencesPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

export default async function TripPreferencesPage({
  params,
}: TripPreferencesPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const trip = await getTripByIdForUser(userId, tripId);

  if (!trip) {
    notFound();
  }

  const missing = getContinueTripCreationMissingRequirements({
    title: trip.title,
    destinations: trip.destinations,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budgetAmount: trip.budgetAmount,
    budgetCurrency: trip.budgetCurrency,
    travelStyle: trip.travelStyle,
  });

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Planning workflow</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            {trip.title}
          </h1>
          {missing.length > 0 ? (
            <>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                This trip needs complete planning details before the preference,
                recommendation, and itinerary workflow can begin.
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
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Trip creation is complete. The preference questionnaire,
                recommendation feedback loop, and itinerary builder continue in
                the next implementation phases.
              </p>
              <Link
                href={`/trips/${trip.id}`}
                className="mt-6 inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
              >
                Back to trip overview
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { requireUser } from "@/lib/authorization";
import { getTripByIdForUser } from "@/features/trips/queries";
import { TripReadinessPanel } from "@/components/trips/trip-readiness-panel";

type TripPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

function detailValue(value?: string | null) {
  return value && value.trim() ? value : "Not set";
}

export default async function TripPage({ params }: TripPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const trip = await getTripByIdForUser(userId, tripId);

  if (!trip) {
    notFound();
  }

  const destinationRoute =
    trip.destinations && trip.destinations.length > 0
      ? trip.destinations
          .map((item) => `${item.city}, ${item.country}`)
          .join(" -> ")
      : null;

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Trip overview</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              {trip.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Review the trip basics and readiness requirements before moving
              into recommendations and itinerary planning.
            </p>
          </div>
          <Link
            href={`/trips/${trip.id}/settings`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-white"
          >
            <Settings aria-hidden="true" className="size-4" />
            Settings
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TripReadinessPanel trip={trip} />
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Basics</h2>
            <dl className="mt-5 grid gap-4 text-sm">
              <div>
                <dt className="font-medium text-zinc-500">Status</dt>
                <dd className="mt-1 text-zinc-950">{trip.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Departure</dt>
                <dd className="mt-1 text-zinc-950">
                  {trip.departureCity && trip.departureCountry
                    ? `${trip.departureCity}, ${trip.departureCountry}`
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Destination</dt>
                <dd className="mt-1 text-zinc-950">
                  {destinationRoute ?? "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Dates</dt>
                <dd className="mt-1 text-zinc-950">
                  {trip.startDate && trip.endDate
                    ? `${new Date(trip.startDate).toLocaleDateString()} - ${new Date(
                        trip.endDate,
                      ).toLocaleDateString()}`
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Budget</dt>
                <dd className="mt-1 text-zinc-950">
                  {trip.budgetAmount && trip.budgetCurrency
                    ? `${trip.budgetCurrency} ${trip.budgetAmount}`
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Travel style</dt>
                <dd className="mt-1 text-zinc-950">
                  {detailValue(trip.travelStyle)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </section>
    </main>
  );
}

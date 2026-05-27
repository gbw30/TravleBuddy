import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/authorization";
import { getTripsForUser } from "@/features/trips/queries";
import { TripSummaryCard } from "@/components/trips/trip-summary-card";

export default async function TripsPage() {
  const userId = await requireUser();
  const trips = await getTripsForUser(userId);

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Trips</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              Your trips
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Manage draft and planning-ready trips owned by your account.
            </p>
          </div>
          <Link
            href="/trips/new"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus aria-hidden="true" className="size-4" />
            New trip
          </Link>
        </div>

        {trips.length > 0 ? (
          <div className="grid gap-4">
            {trips.map((trip) => (
              <TripSummaryCard key={trip.id} trip={trip} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8">
            <h2 className="text-lg font-semibold text-zinc-950">
              No trips yet
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Create a draft with only a title. Destination, dates, and budget can
              be added later to unlock full planning.
            </p>
            <Link
              href="/trips/new"
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <Plus aria-hidden="true" className="size-4" />
              New trip
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

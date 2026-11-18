import Link from "next/link";
import { MapPinned, Plus, Route, UserRound } from "lucide-react";
import { requireUser } from "@/lib/authorization";
import { auth } from "@/lib/auth";
import { getTripsForUser } from "@/features/trips/queries";
import { TripSummaryCard } from "@/components/trips/trip-summary-card";

export default async function DashboardPage() {
  const userId = await requireUser();
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? "Traveler";
  const trips = await getTripsForUser(userId);
  const recentTrips = trips.slice(0, 3);

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              Welcome, {displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Create drafts quickly, then complete destination, dates, and budget
              when you are ready for full planning.
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

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/trips"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
          >
            <MapPinned aria-hidden="true" className="mb-4 size-5 text-zinc-700" />
            <h2 className="text-base font-semibold text-zinc-950">Trips</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Protected trip workspace for Phase 4 CRUD.
            </p>
          </Link>
          <Link
            href="/profile"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
          >
            <UserRound aria-hidden="true" className="mb-4 size-5 text-zinc-700" />
            <h2 className="text-base font-semibold text-zinc-950">Profile</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              View the signed-in account identity.
            </p>
          </Link>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <Route aria-hidden="true" className="mb-4 size-5 text-zinc-700" />
            <h2 className="text-base font-semibold text-zinc-950">Planning</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Full planning unlocks once a trip has a destination, dates, and
              budget.
            </p>
          </div>
        </div>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Recent trips</h2>
            <Link href="/trips" className="text-sm font-medium text-zinc-700 hover:text-zinc-950">
              View all
            </Link>
          </div>
          {recentTrips.length > 0 ? (
            <div className="grid gap-4">
              {recentTrips.map((trip) => (
                <TripSummaryCard key={trip.id} trip={trip} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6">
              <h3 className="text-base font-semibold text-zinc-950">
                No trips yet
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Start with a title-only draft and fill in the details when the
                trip becomes real.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

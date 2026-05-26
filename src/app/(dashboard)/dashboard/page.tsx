import Link from "next/link";
import { MapPinned, Route, UserRound } from "lucide-react";
import { requireUser } from "@/lib/authorization";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  await requireUser();
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? "Traveler";

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm font-medium text-zinc-500">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
            Welcome, {displayName}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Phase 3 secures this workspace. Trip creation and planning actions
            begin in the next development phase.
          </p>
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
              Auth and ownership guards are ready for itinerary features.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

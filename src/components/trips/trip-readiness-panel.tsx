import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TripDto } from "@/features/trips/types";

export function TripReadinessPanel({ trip }: { trip: TripDto }) {
  const isReady = trip.readiness.canUseFullPlanning;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        {isReady ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 text-emerald-600" />
        ) : (
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 text-amber-600" />
        )}
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {isReady ? "Full planning is unlocked" : "Full planning is locked"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Draft discovery is available now. Itinerary, map, conflicts, and full
            export stay locked until the trip has a destination, dates, and budget.
          </p>
          {!isReady ? (
            <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
              {trip.readiness.missingRequirements.map((requirement) => (
                <li key={requirement} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                  {requirement}
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={isReady ? `/trips/${trip.id}/planning` : `/trips/${trip.id}/settings`}
            className={
              isReady
                ? "mt-5 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
                : "mt-5 inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            }
          >
            {isReady ? "Open planning loop" : "Complete trip details"}
          </Link>
        </div>
      </div>
    </section>
  );
}

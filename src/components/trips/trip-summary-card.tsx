import Link from "next/link";
import { CalendarDays, MapPinned, WalletCards } from "lucide-react";
import type { TripDto } from "@/features/trips/types";

function formatDateRange(trip: TripDto) {
  if (!trip.startDate || !trip.endDate) {
    return "Dates not set";
  }

  const start = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(trip.startDate));
  const end = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(trip.endDate));

  return `${start} - ${end}`;
}

function formatDestination(trip: TripDto) {
  const destinations = trip.destinations ?? [];

  return destinations.length > 0
    ? destinations
        .map((destination) => `${destination.city}, ${destination.country}`)
        .join(" -> ")
    : "Destination not set";
}

function formatBudget(trip: TripDto) {
  return trip.budgetAmount && trip.budgetCurrency
    ? `${trip.budgetCurrency} ${trip.budgetAmount}`
    : "Budget not set";
}

export function TripSummaryCard({ trip }: { trip: TripDto }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {trip.status}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-950">{trip.title}</h2>
        </div>
        <span
          className={
            trip.readiness.canUseFullPlanning
              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              : "rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
          }
        >
          {trip.readiness.canUseFullPlanning ? "Planning ready" : "Draft"}
        </span>
      </div>
      <dl className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <MapPinned aria-hidden="true" className="size-4 text-zinc-500" />
          <span>{formatDestination(trip)}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 text-zinc-500" />
          <span>{formatDateRange(trip)}</span>
        </div>
        <div className="flex items-center gap-2">
          <WalletCards aria-hidden="true" className="size-4 text-zinc-500" />
          <span>{formatBudget(trip)}</span>
        </div>
      </dl>
    </Link>
  );
}

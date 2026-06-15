import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/authorization";
import { getItinerary } from "@/features/itinerary/builder";
import type { ItineraryItemDto } from "@/features/itinerary/types";

type ItineraryPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

function money(value: {
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
}) {
  if (!value.estimatedCostAmount || !value.estimatedCostCurrency) {
    return "Cost not estimated";
  }

  return `${value.estimatedCostCurrency} ${value.estimatedCostAmount}`;
}

function locationLabel(item: ItineraryItemDto) {
  if (item.city && item.country) {
    return `${item.city}, ${item.country}`;
  }

  return item.city ?? item.country ?? "Location not set";
}

function groupItemsByLocation(items: readonly ItineraryItemDto[]) {
  const groups = new Map<string, { label: string; items: ItineraryItemDto[] }>();

  items.forEach((item) => {
    const label = locationLabel(item);
    const existing = groups.get(label);

    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(label, {
      label,
      items: [item],
    });
  });

  return Array.from(groups.values());
}

export default async function ItineraryPage({ params }: ItineraryPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const result = await getItinerary(userId, tripId);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status !== "ok") {
    return (
      <main className="flex-1 bg-zinc-50">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">
              Generated itinerary
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Itinerary is locked
            </h1>
            {result.status === "archived" ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Archived trips cannot show generated itineraries.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Complete the trip details before opening the itinerary draft.
                </p>
                <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
                  {result.missingRequirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </>
            )}
            <Link
              href={`/trips/${tripId}/planning`}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Back to planning
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const { itinerary } = result;

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">
              Generated itinerary
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              Read-only itinerary draft
            </h1>
          </div>
          <Link
            href={`/trips/${tripId}/planning`}
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-white"
          >
            Back to planning
          </Link>
        </div>

        {itinerary.days.length > 0 ? (
          <>
            <section className="mb-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays aria-hidden="true" className="size-5 text-zinc-500" />
                <h2 className="text-base font-semibold text-zinc-950">
                  Trip summary
                </h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {itinerary.totals.itemCount} selected places -{" "}
                {money(itinerary.totals)}
              </p>
            </section>

            <ol className="grid gap-5">
              {itinerary.days.map((day) => (
                <li
                  key={day.id}
                  className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-500">
                        {day.date ?? "Date not set"}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-zinc-950">
                        Day {day.dayNumber}
                      </h2>
                    </div>
                    <div className="text-right text-sm text-zinc-600">
                      <p>{day.itemCount} items</p>
                      <p className="mt-1">{money(day)}</p>
                    </div>
                  </div>

                  {day.items.length > 0 ? (
                    <div className="mt-4 grid gap-4">
                      {groupItemsByLocation(day.items).map((group) => (
                        <section key={group.label}>
                          <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                            {group.label}
                          </h3>
                          <ul className="mt-2 grid gap-3">
                            {group.items.map((item) => (
                              <li
                                key={item.id}
                                className="rounded-md border border-zinc-200 p-4"
                              >
                                <p className="text-sm font-semibold text-zinc-950">
                                  {item.title}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-normal text-zinc-500">
                                  {item.category ?? "PLACE"}
                                </p>
                                {item.description ? (
                                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                                    {item.description}
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-zinc-600">
                      No selected places assigned to this day yet.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">
              Select places in planning first
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Pick recommendations or add already-decided places in the planning
              workspace to create the first generated itinerary draft.
            </p>
            <Link
              href={`/trips/${tripId}/planning`}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Back to planning
            </Link>
          </section>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/authorization";
import { getItinerary } from "@/features/itinerary/builder";
import {
  checkItineraryConflictsFormAction,
  updateItineraryConflictStatusFormAction,
} from "@/features/itinerary/conflict-actions";
import type {
  ItineraryConflictDto,
  ItineraryItemDto,
  ItineraryTimeSlotDto,
} from "@/features/itinerary/types";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type ItineraryPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

function money(value: {
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
  costIsComplete?: boolean;
  excludedCostCurrencies?: string[];
}) {
  if (!value.estimatedCostAmount || !value.estimatedCostCurrency) {
    return "Cost not estimated";
  }

  const estimate = `${value.estimatedCostCurrency} ${value.estimatedCostAmount}`;

  return value.costIsComplete === false
    ? `${estimate} (partial; excludes ${(value.excludedCostCurrencies ?? []).join(", ")})`
    : estimate;
}

function locationLabel(item: ItineraryItemDto) {
  if (item.city && item.country) {
    return `${item.city}, ${item.country}`;
  }

  return item.city ?? item.country ?? "Location not set";
}

function groupItemsByLocation(items: readonly ItineraryItemDto[]) {
  const groups = new Map<
    string,
    { label: string; items: ItineraryItemDto[] }
  >();

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

function openIssueLabel(count: number) {
  return `${count} open issue${count === 1 ? "" : "s"}`;
}

function severityLabel(conflict: ItineraryConflictDto) {
  return conflict.severity.toLocaleLowerCase();
}

function severityTone(conflict: ItineraryConflictDto) {
  if (conflict.severity === "HIGH") {
    return {
      item: "rounded-md border border-red-200 bg-red-50 p-4",
      label: "text-xs font-semibold uppercase tracking-normal text-red-800",
      button:
        "inline-flex h-9 items-center rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-red-100",
    };
  }

  if (conflict.severity === "MEDIUM") {
    return {
      item: "rounded-md border border-amber-200 bg-amber-50 p-4",
      label: "text-xs font-semibold uppercase tracking-normal text-amber-800",
      button:
        "inline-flex h-9 items-center rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-amber-100",
    };
  }

  return {
    item: "rounded-md border border-sky-200 bg-sky-50 p-4",
    label: "text-xs font-semibold uppercase tracking-normal text-sky-800",
    button:
      "inline-flex h-9 items-center rounded-md border border-sky-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-sky-100",
  };
}

function slotTime(value: string) {
  return new Date(value).toISOString().slice(11, 16);
}

function slotLabel(slot: ItineraryTimeSlotDto) {
  if (slot.travelSegmentId) {
    return "Travel";
  }

  if (slot.city && slot.country) {
    return slot.city;
  }

  return "Open";
}

function slotClasses(slot: ItineraryTimeSlotDto) {
  if (slot.travelSegmentId) {
    return "min-h-12 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left";
  }

  if (slot.city || slot.country) {
    return "min-h-12 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-left";
  }

  return "min-h-12 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-left";
}

export default async function ItineraryPage({ params }: ItineraryPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const result = await getItinerary(userId, tripId);

  if (
    result.status === "not_found" ||
    result.status === "version_not_found" ||
    result.status === "invalid_version"
  ) {
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
  const hasConflicts = itinerary.conflicts.length > 0;

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

        <section className="mb-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                aria-hidden="true"
                className={
                  hasConflicts
                    ? "mt-0.5 size-5 text-amber-600"
                    : "mt-0.5 size-5 text-zinc-500"
                }
              />
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Conflict check
                </p>
                <h2 className="mt-1 text-base font-semibold text-zinc-950">
                  {openIssueLabel(itinerary.conflictSummary.total)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Checks refresh automatically when the itinerary or trip
                  settings change. Use the button to rerun the same check now.
                </p>
              </div>
            </div>
            <form action={checkItineraryConflictsFormAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <PendingSubmitButton
                pendingLabel="Checking..."
                className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Check conflicts
              </PendingSubmitButton>
            </form>
          </div>
          {hasConflicts ? (
            <ul className="mt-4 grid gap-3">
              {itinerary.conflicts.map((conflict) => {
                const tone = severityTone(conflict);

                return (
                  <li key={conflict.id} className={tone.item}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className={tone.label}>
                          {severityLabel(conflict)} -{" "}
                          {conflict.type
                            .toLocaleLowerCase()
                            .replaceAll("_", " ")}
                        </p>
                        <p className="mt-2 text-sm font-medium text-zinc-950">
                          {conflict.message}
                        </p>
                        {conflict.recommendation ? (
                          <p className="mt-2 text-sm leading-6 text-zinc-700">
                            {conflict.recommendation}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form action={updateItineraryConflictStatusFormAction}>
                          <input type="hidden" name="tripId" value={tripId} />
                          <input
                            type="hidden"
                            name="conflictId"
                            value={conflict.id}
                          />
                          <input type="hidden" name="status" value="RESOLVED" />
                          <PendingSubmitButton
                            pendingLabel="Resolving..."
                            className={tone.button}
                          >
                            Resolve
                          </PendingSubmitButton>
                        </form>
                        <form action={updateItineraryConflictStatusFormAction}>
                          <input type="hidden" name="tripId" value={tripId} />
                          <input
                            type="hidden"
                            name="conflictId"
                            value={conflict.id}
                          />
                          <input type="hidden" name="status" value="IGNORED" />
                          <PendingSubmitButton
                            pendingLabel="Ignoring..."
                            className={tone.button}
                          >
                            Ignore
                          </PendingSubmitButton>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-6 text-zinc-600">
              No open conflict warnings are stored for this itinerary.
            </p>
          )}
        </section>

        {itinerary.days.length > 0 ? (
          <>
            <section className="mb-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays
                  aria-hidden="true"
                  className="size-5 text-zinc-500"
                />
                <h2 className="text-base font-semibold text-zinc-950">
                  Trip summary
                </h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {itinerary.totals.itemCount} selected places -{" "}
                {money(itinerary.totals)}
              </p>
            </section>

            {(itinerary.unscheduledItems ?? []).length > 0 ? (
              <section
                aria-labelledby="unscheduled-items-title"
                className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-5 shadow-sm"
              >
                <h2
                  id="unscheduled-items-title"
                  className="text-base font-semibold text-zinc-950"
                >
                  Selected but unscheduled
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  These selections remain part of your plan, but the current
                  pace has no day capacity for them. No live scheduling is
                  implied.
                </p>
                <ul className="mt-4 grid gap-3">
                  {(itinerary.unscheduledItems ?? []).map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-sky-200 bg-white p-4"
                    >
                      <p className="text-sm font-semibold text-zinc-950">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">
                        {item.reasonMessage}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

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

                  {(day.timeSlots ?? []).length > 0 ? (
                    <section className="mt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                        30-minute timeline
                      </h3>
                      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">
                        {(day.timeSlots ?? []).map((slot) => (
                          <div
                            key={slot.startTime}
                            className={slotClasses(slot)}
                          >
                            <p className="text-[11px] font-medium text-zinc-500">
                              {slotTime(slot.startTime)}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-zinc-800">
                              {slotLabel(slot)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

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

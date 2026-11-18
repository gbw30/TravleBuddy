import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, Plane, Route, Trash2 } from "lucide-react";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { TimedAlert } from "@/components/ui/timed-alert";
import { requireUser } from "@/lib/authorization";
import {
  addTripTravelSegmentFormAction,
  deleteTripTravelSegmentFormAction,
  getTripLogisticsWorkspace,
  saveTripLogisticsModeFormAction,
} from "@/features/trips/logistics";

type LogisticsPageProps = {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{
    error?: string | string[];
    saved?: string | string[];
  }>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function locationValue(location: { city: string | null; country: string | null }) {
  return `${location.city ?? ""}|||${location.country ?? ""}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function timeInputBounds(startDate: string | null, endDate: string | null) {
  return {
    min: startDate ? `${startDate}T00:00` : undefined,
    max: endDate ? `${endDate}T23:59` : undefined,
  };
}

type LocationOption = {
  city: string;
  country: string;
  label: string;
};

export default async function LogisticsPage({
  params,
  searchParams,
}: LogisticsPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const query = await searchParams;
  const result = await getTripLogisticsWorkspace(userId, tripId);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "archived") {
    return (
      <main className="flex-1 bg-zinc-50">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Before planning</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Logistics are locked
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Archived trips cannot change ticket timing or planning mode.
            </p>
            <Link
              href={`/trips/${tripId}`}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Trip overview
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const { trip, travelSegments } = result;
  const rawLocations = [
    trip.departureCity && trip.departureCountry
      ? {
          city: trip.departureCity,
          country: trip.departureCountry,
          label: `${trip.departureCity}, ${trip.departureCountry}`,
        }
      : null,
    ...trip.destinations.map((destination) => ({
      city: destination.city,
      country: destination.country,
      label: `${destination.city}, ${destination.country}`,
    })),
  ];
  const locations = rawLocations
    .filter((location): location is LocationOption => Boolean(location))
    .filter(
      (location, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.city === location.city &&
            candidate.country === location.country,
        ) === index,
    );
  const bounds = timeInputBounds(trip.startDate, trip.endDate);
  const error = firstQueryValue(query?.error);
  const saved = firstQueryValue(query?.saved);

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Before planning</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              {trip.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Choose how city timing should be handled before entering the
              planning loop.
            </p>
          </div>
          <Link
            href={`/trips/${trip.id}/planning`}
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-white"
          >
            Skip to planning
          </Link>
        </div>

        {saved ? (
          <TimedAlert className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Logistics saved.
          </TimedAlert>
        ) : null}
        {error ? (
          <TimedAlert
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Check the trip date range, city fields, and arrival time before
            saving logistics.
          </TimedAlert>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="grid gap-5">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Plane aria-hidden="true" className="mt-0.5 size-5 text-zinc-500" />
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950">
                    I have tickets/timing
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Add known transfers so the itinerary can assign city
                    windows and show travel blocks in 30-minute slots.
                  </p>
                </div>
              </div>

              <form action={addTripTravelSegmentFormAction} className="mt-5 grid gap-4">
                <input type="hidden" name="tripId" value={trip.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Mode</span>
                    <select
                      name="segmentMode"
                      defaultValue="FLIGHT"
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                    >
                      <option value="FLIGHT">Flight</option>
                      <option value="TRAIN">Train</option>
                      <option value="BUS">Bus</option>
                      <option value="CAR">Car</option>
                      <option value="FERRY">Ferry</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Carrier</span>
                    <input
                      name="carrier"
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Origin</span>
                    <select
                      name="originLocation"
                      required
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                    >
                      <option value="">Select city</option>
                      {locations.map((location) => (
                        <option key={`origin-${location.label}`} value={locationValue(location)}>
                          {location.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Destination</span>
                    <select
                      name="destinationLocation"
                      required
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                    >
                      <option value="">Select city</option>
                      {locations.map((location) => (
                        <option key={`destination-${location.label}`} value={locationValue(location)}>
                          {location.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Depart</span>
                    <input
                      name="departAt"
                      type="datetime-local"
                      required
                      min={bounds.min}
                      max={bounds.max}
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Arrive</span>
                    <input
                      name="arriveAt"
                      type="datetime-local"
                      required
                      min={bounds.min}
                      max={bounds.max}
                      className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Reference</span>
                  <input
                    name="referenceCode"
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                    placeholder="Optional ticket or confirmation code"
                  />
                </label>
                <PendingSubmitButton
                  pendingLabel="Saving timing..."
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  <ArrowRight aria-hidden="true" className="size-4" />
                  Save ticket timing
                </PendingSubmitButton>
              </form>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Route aria-hidden="true" className="mt-0.5 size-5 text-zinc-500" />
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950">
                    I&rsquo;ll decide city timing while planning
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Keep the current manual city and day selector in the
                    planning loop.
                  </p>
                </div>
              </div>
              <form action={saveTripLogisticsModeFormAction} className="mt-4">
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="mode" value="FLEXIBLE" />
                <PendingSubmitButton
                  pendingLabel="Saving..."
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <ArrowRight aria-hidden="true" className="size-4" />
                  Continue flexible planning
                </PendingSubmitButton>
              </form>
            </div>
          </section>

          <aside className="grid gap-5 self-start">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock aria-hidden="true" className="size-5 text-zinc-500" />
                <h2 className="text-base font-semibold text-zinc-950">
                  Saved timing
                </h2>
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                {trip.startDate ?? "Start not set"} to {trip.endDate ?? "end not set"}
              </p>
              {travelSegments.length > 0 ? (
                <ol className="mt-4 grid gap-3">
                  {travelSegments.map((segment) => (
                    <li
                      key={segment.id}
                      className="rounded-md border border-zinc-200 p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                        {segment.mode.toLocaleLowerCase()}
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-950">
                        {segment.originCity} to {segment.destinationCity}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-zinc-600">
                        {formatDateTime(segment.departAt)} to{" "}
                        {formatDateTime(segment.arriveAt)}
                      </p>
                      {segment.carrier || segment.referenceCode ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          {[segment.carrier, segment.referenceCode]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                      ) : null}
                      <form action={deleteTripTravelSegmentFormAction} className="mt-3">
                        <input type="hidden" name="tripId" value={trip.id} />
                        <input type="hidden" name="segmentId" value={segment.id} />
                        <PendingSubmitButton
                          pendingLabel="Removing..."
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                          Remove
                        </PendingSubmitButton>
                      </form>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  No ticket timing saved yet.
                </p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

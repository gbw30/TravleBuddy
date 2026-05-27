import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { getTripByIdForUser } from "@/features/trips/queries";
import { TripSettingsForm } from "@/components/trips/trip-settings-form";

type TripSettingsPageProps = {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function TripSettingsPage({
  params,
  searchParams,
}: TripSettingsPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const trip = await getTripByIdForUser(userId, tripId);
  const query = await searchParams;

  if (!trip) {
    notFound();
  }

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {query?.error === "invalid" ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Check the trip details. Destination, dates, and budget must be
            provided as complete pairs.
          </div>
        ) : null}
        {query?.error === "confirm-delete" ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Confirm deletion before removing this trip.
          </div>
        ) : null}
        {query?.error === "archived" ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Archived trips cannot be edited or deleted in Stage 4.
          </div>
        ) : null}
        <TripSettingsForm trip={trip} />
      </section>
    </main>
  );
}

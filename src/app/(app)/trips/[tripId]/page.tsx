import Link from "next/link";
import { notFound } from "next/navigation";

import { dateRange } from "@/components/keepsake/format";
import { PlanStateButton } from "@/components/keepsake/plan-state-button";
import {
  eyebrow,
  pageTitle,
  quiet,
  sectionTitle,
} from "@/components/keepsake/styles";
import { TripCardActions } from "@/components/keepsake/trip-card-actions";
import { TripCommitments } from "@/components/keepsake/trip-commitments";
import { TripFactsForm } from "@/components/keepsake/trip-facts-form";
import { getTrip } from "@/features/trips";
import { requireUser } from "@/lib/authorization";

const stateLabel = { planning: "Planning", upcoming: "Upcoming", past: "Past" };

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const userId = await requireUser();
  const { tripId } = await params;
  const trip = await getTrip(userId, tripId);
  if (!trip) notFound();

  const { facts, commitments, clashes, ...summary } = trip;

  return (
    <main className="py-10 md:py-14">
      <p className={eyebrow}>
        {trip.archived ? "Archived" : stateLabel[trip.state]} ·{" "}
        {dateRange(trip.startDate, trip.endDate)}
      </p>
      <h1 className={`mt-4 ${pageTitle} [overflow-wrap:anywhere]`}>
        {trip.title}
      </h1>
      <p className="mt-5 max-w-[36rem] text-lg text-ink/80">
        {trip.archived
          ? "This trip is archived. Restore it to change anything."
          : trip.planningMode === "QUICK"
            ? "You asked me to build this one for you. Start with the facts and what is already decided; I plan around both."
            : "We are planning this one together. Start with the facts and what is already decided; I plan around both."}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {!trip.archived && (
          <PlanStateButton
            tripId={trip.id}
            revision={trip.revision}
            finished={trip.state !== "planning"}
          />
        )}
        <TripCardActions trip={summary} afterDelete="/home" />
      </div>

      <div className="mt-12 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <section aria-labelledby="facts-heading" className="min-w-0">
          <h2 id="facts-heading" className={sectionTitle}>
            The <em>facts</em>
          </h2>
          <p className="mt-2.5 mb-6 text-[16.5px] text-muted">
            Fill in what you know. Anything left empty I will ask about later.
          </p>
          <TripFactsForm
            key={`${trip.id}-${trip.archived}`}
            tripId={trip.id}
            revision={trip.revision}
            initial={facts}
            readOnly={trip.archived}
          />
        </section>

        <aside className="min-w-0 rounded-2xl bg-tint/60 p-6 [--notch:#f1eadc]">
          <TripCommitments
            key={`${trip.id}-${trip.archived}`}
            tripId={trip.id}
            revision={trip.revision}
            initial={{ commitments, clashes }}
            readOnly={trip.archived}
          />
        </aside>
      </div>

      <p className="mt-16 border-t border-ink/12 pt-6 font-sans text-[13px] text-muted">
        Choosing places and building the day-by-day plan are being rebuilt in
        this design. Until then the earlier planner still works for this trip:{" "}
        <Link href={`/trips/${trip.id}/preferences`} className={quiet}>
          preferences
        </Link>
        ,{" "}
        <Link href={`/trips/${trip.id}/planning`} className={quiet}>
          places
        </Link>{" "}
        and{" "}
        <Link href={`/trips/${trip.id}/itinerary`} className={quiet}>
          itinerary
        </Link>
        .
      </p>
    </main>
  );
}

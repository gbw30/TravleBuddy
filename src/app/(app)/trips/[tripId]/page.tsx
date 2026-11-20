import Link from "next/link";
import { notFound } from "next/navigation";

import { dateRange } from "@/components/keepsake/format";
import { PlanStateButton } from "@/components/keepsake/plan-state-button";
import {
  buttonSecond,
  eyebrow,
  pageTitle,
  sectionTitle,
} from "@/components/keepsake/styles";
import { TripCardActions } from "@/components/keepsake/trip-card-actions";
import { TripCommitments } from "@/components/keepsake/trip-commitments";
import { TripConversation } from "@/components/keepsake/trip-conversation";
import { TripFactsForm } from "@/components/keepsake/trip-facts-form";
import { TripWorkspace } from "@/components/keepsake/trip-workspace";
import { positionedCities } from "@/features/places/contracts";
import { getTrip } from "@/features/trips";
import { requireUser } from "@/lib/authorization";
import { loadConversation } from "@/use-cases/conversation";
import { loadPlan } from "@/use-cases/plan";

const stateLabel = { planning: "Planning", upcoming: "Upcoming", past: "Past" };

const slotPattern = /^d\d{1,3}-[a-z0-9-]{4,12}$/;

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ slot?: string | string[] }>;
}) {
  const userId = await requireUser();
  const { tripId } = await params;
  // The slot to show cards for: set when the traveller names a day in conversation.
  const { slot } = await searchParams;
  const focus =
    typeof slot === "string" && slotPattern.test(slot) ? slot : undefined;
  const trip = await getTrip(userId, tripId);
  if (!trip) notFound();

  const { facts, commitments, clashes, ...summary } = trip;
  // The page does not wait for the place provider; the workspace asks for
  // places once it is on screen.
  const plan = await loadPlan(userId, tripId, focus, false);
  // Read after the plan, so a proposal the plan has just made is in the thread.
  const conversation =
    trip.planningMode === "GUIDED"
      ? await loadConversation(userId, tripId)
      : null;

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
            ? "You asked me to build this one for you. Tell me the essentials in the trip brief. You can also choose each slot from three places yourself."
            : "We are planning this one together: for each slot I offer three places, and what you pick lands in the itinerary."}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {!trip.archived && (
          <PlanStateButton
            tripId={trip.id}
            revision={trip.revision}
            finished={trip.state !== "planning"}
          />
        )}
        {!trip.archived && (
          <Link href={`/trips/${trip.id}/brief`} className={buttonSecond}>
            Open the trip brief
          </Link>
        )}
        <TripCardActions trip={summary} afterDelete="/home" />
      </div>

      {conversation && (
        <div className="mt-12 border-t border-ink/12 pt-10">
          <TripConversation
            key={trip.id}
            tripId={trip.id}
            revision={trip.revision}
            initial={conversation}
            readOnly={trip.archived}
          />
        </div>
      )}

      {plan && (
        <div className="mt-12 border-t border-ink/12 pt-10">
          {/* The workspace stays in place when the trip changes and reads the
              plan again itself. A day named in conversation starts it on that slot. */}
          <TripWorkspace
            key={`${trip.id}-${focus ?? ""}`}
            tripId={trip.id}
            revision={trip.revision}
            initial={plan}
            readOnly={trip.archived}
          />
        </div>
      )}

      <div className="mt-16 grid items-start gap-12 border-t border-ink/12 pt-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
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
            cities={positionedCities(facts.cities)}
            readOnly={trip.archived}
          />
        </aside>
      </div>
    </main>
  );
}

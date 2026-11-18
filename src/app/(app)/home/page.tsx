import Link from "next/link";

import { Stamp } from "@/components/keepsake/day-stamp";
import { dateRange, dayLabel } from "@/components/keepsake/format";
import { PlaceArt } from "@/components/keepsake/place-art";
import {
  buttonArrow,
  buttonLarge,
  cardTitle,
  eyebrow,
  pageTitle,
  quietLarge,
  sectionTitle,
} from "@/components/keepsake/styles";
import { TicketStub } from "@/components/keepsake/ticket-stub";
import { TripCardActions } from "@/components/keepsake/trip-card-actions";
import { getTrip, listTrips } from "@/features/trips";
import type { MissingFact, TripSummary } from "@/features/trips/contracts";
import { requireUser } from "@/lib/authorization";

const stateLabel = { planning: "Planning", upcoming: "Upcoming", past: "Past" };
const factWord: Record<MissingFact, string> = {
  where: "where you are going",
  when: "when",
  who: "who is travelling",
  budget: "the budget",
};
const numberWord = ["no", "one", "two", "three", "four"];
const list = new Intl.ListFormat("en", { type: "conjunction" });

const placeOf = (trip: TripSummary) => trip.cities[0] ?? trip.title;

/** The headline's closing words, by how far along the trip is. */
function headline(trip: TripSummary) {
  if (trip.state === "upcoming") return "is coming up.";
  if (trip.state === "past") return "is one to remember.";
  const open = trip.missingFacts.length;
  if (open === 0) return "has its facts in place.";
  return `is waiting on ${numberWord[open]} ${open === 1 ? "answer" : "answers"}.`;
}

function TripPicture({
  trip,
  className,
}: {
  trip: TripSummary;
  className: string;
}) {
  return (
    <PlaceArt
      place={{ name: trip.title, essentials: placeOf(trip), photo: null }}
      showPhoto={false}
      className={className}
    />
  );
}

export default async function HomePage() {
  const userId = await requireUser();
  const trips = await listTrips(userId);
  const active = trips.filter((trip) => !trip.archived);
  const archived = trips.filter((trip) => trip.archived);
  const current =
    active.find((trip) => trip.state === "planning") ?? active[0] ?? null;

  if (!current) {
    return (
      <main>
        <section className="py-16 md:py-24">
          <p className={eyebrow}>Welcome</p>
          <h1 className={`mt-4 max-w-[13ch] ${pageTitle}`}>
            Where to <em>first?</em>
          </h1>
          <p className="mt-5 max-w-[30rem] text-lg text-ink/80 md:text-xl">
            You have no trips yet. Start one with the tickets you already hold,
            or with nothing booked at all.
          </p>
          <Link href="/trips/new" className={`${buttonLarge} mt-8`}>
            New trip
            <span aria-hidden className={buttonArrow}>
              →
            </span>
          </Link>
        </section>
        <ArchivedTrips trips={archived} />
      </main>
    );
  }

  const others = active.filter((trip) => trip !== current);
  // The trip in front also shows its first booked ticket.
  const detail = await getTrip(userId, current.id);
  const ticket = detail?.commitments.find((c) => c.date && c.startTime);
  const booked =
    current.commitmentCount === 0
      ? "Nothing is booked yet."
      : current.commitmentCount === 1
        ? "One thing is already decided."
        : `${current.commitmentCount} things are already decided.`;

  return (
    <main>
      <section className="grid items-center gap-10 py-12 md:grid-cols-[minmax(0,1fr)_min(42vw,520px)] md:gap-14 md:py-20">
        <div className="min-w-0">
          <p className={eyebrow}>
            Welcome back · {stateLabel[current.state]} ·{" "}
            {dateRange(current.startDate, current.endDate)}
          </p>
          <h1 className="mt-4 text-[46px] leading-[1.02] tracking-[-0.035em] text-balance [overflow-wrap:anywhere] md:text-[76px]">
            {placeOf(current)} <em>{headline(current)}</em>
          </h1>
          <p className="mt-5 max-w-[30rem] text-lg text-ink/80 md:text-xl">
            {current.title}. {booked}
            {current.state === "planning" &&
              current.missingFacts.length > 0 &&
              ` Still to settle: ${list.format(current.missingFacts.map((fact) => factWord[fact]))}.`}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link href={`/trips/${current.id}`} className={buttonLarge}>
              {current.state === "planning" ? "Continue planning" : "Open trip"}
              <span aria-hidden className={buttonArrow}>
                →
              </span>
            </Link>
            <Link href="/trips/new" className={quietLarge}>
              New trip
            </Link>
          </div>
          <TripCardActions trip={current} />
        </div>
        {/* Keepsakes from the trip in front, laid out like things on a table. */}
        <div className="relative h-[300px] md:h-[430px]">
          <div className="absolute top-2 left-0 w-[76%] -rotate-3 rounded-[4px] bg-card p-2.5 shadow-print md:left-5">
            <TripPicture trip={current} className="aspect-[4/3.2]" />
          </div>
          {ticket && (
            <div className="absolute bottom-0 left-0 w-[86%] -rotate-[1.5deg] shadow-print md:w-[370px]">
              <TicketStub
                time={ticket.startTime!}
                title={ticket.title}
                note={dayLabel(ticket.date!)}
              />
            </div>
          )}
        </div>
      </section>

      {others.length > 0 && (
        <section
          aria-labelledby="trips-heading"
          className="border-t border-ink/12 pt-12"
        >
          <h2 id="trips-heading" className={sectionTitle}>
            Your other trips
          </h2>
          <ul className="mt-8 grid gap-10 md:grid-cols-2">
            {others.map((trip) => (
              <li key={trip.id} className="min-w-0">
                <div className="relative">
                  <TripPicture
                    trip={trip}
                    className="aspect-[16/10] rounded-md"
                  />
                  {trip.state === "past" && (
                    <span className="absolute right-3 bottom-4">
                      <Stamp
                        label={`${placeOf(trip).toUpperCase()} · ${trip.endDate?.slice(0, 4) ?? ""}`}
                        spoken={`Visited: ${trip.title}`}
                        solid
                      />
                    </span>
                  )}
                </div>
                <p className={`${eyebrow} mt-4`}>
                  <span
                    className={
                      trip.state === "upcoming"
                        ? "font-semibold text-terracotta"
                        : ""
                    }
                  >
                    {stateLabel[trip.state]}
                  </span>{" "}
                  · {dateRange(trip.startDate, trip.endDate)}
                </p>
                <h3 className={`mt-1.5 ${cardTitle} [overflow-wrap:anywhere]`}>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="underline decoration-transparent underline-offset-4 transition-colors duration-150 ease-settle hover:decoration-ink/40"
                  >
                    {trip.title}
                  </Link>
                </h3>
                <TripCardActions trip={trip} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ArchivedTrips trips={archived} />
    </main>
  );
}

function ArchivedTrips({ trips }: { trips: TripSummary[] }) {
  if (trips.length === 0) return null;
  return (
    <details className="mt-16 border-t border-ink/12 pt-6">
      <summary className="cursor-pointer font-sans text-[15px] font-medium">
        Archived trips ({trips.length})
      </summary>
      <ul className="mt-4 grid gap-6 md:grid-cols-2">
        {trips.map((trip) => (
          <li key={trip.id} className="min-w-0">
            <p className={eyebrow}>{dateRange(trip.startDate, trip.endDate)}</p>
            <p className="mt-1 font-serif text-[21px] [overflow-wrap:anywhere]">
              {trip.title}
            </p>
            <TripCardActions trip={trip} />
          </li>
        ))}
      </ul>
    </details>
  );
}

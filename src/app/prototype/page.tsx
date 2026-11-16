import Link from "next/link";

import { Stamp } from "@/components/keepsake/day-stamp";
import {
  buttonArrow,
  buttonLarge,
  eyebrow,
  quiet,
  quietLarge,
} from "@/components/keepsake/styles";
import { TicketStub } from "@/components/keepsake/ticket-stub";
import { homeTrips, profileEntries } from "@/features/prototype/sample-home";

const stateLabel = { planning: "Planning", upcoming: "Upcoming", past: "Past" };
const print = "absolute rounded-[4px] bg-card p-2.5 shadow-print";
const photo =
  "block size-full rounded-[2px] object-cover outline outline-1 -outline-offset-1 outline-black/10";

export default function PrototypeHome() {
  const [current, ...others] = homeTrips;

  return (
    <>
      <section className="grid items-center gap-10 py-12 md:grid-cols-[minmax(0,1fr)_min(42vw,520px)] md:gap-14 md:py-20">
        <div>
          <p className={eyebrow}>
            Welcome back · {stateLabel[current.state]} · {current.dates}
          </p>
          <h1 className="mt-4 text-[46px] leading-[1.02] tracking-[-0.035em] text-balance md:text-[76px]">
            Tokyo is waiting on <em>five choices.</em>
          </h1>
          <p className="mt-5 max-w-[30rem] text-lg text-ink/80 md:text-xl">
            {current.title}. Your flight, your hotel and your teamLab ticket are
            already in place. {current.progress}.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link href="/prototype/trip" className={buttonLarge}>
              Continue planning
              <span aria-hidden className={buttonArrow}>
                →
              </span>
            </Link>
            <Link href="/prototype/new" className={quietLarge}>
              New trip
            </Link>
          </div>
        </div>
        {/* Keepsakes from the trip in progress, laid out like things on a table. */}
        <div className="relative h-[330px] md:h-[470px]">
          <div className={`${print} top-2 left-0 w-[76%] -rotate-3 md:left-5`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static sample photos */}
            <img
              src={current.photo}
              alt=""
              className={`${photo} aspect-[4/3.2]`}
            />
          </div>
          <div
            className={`${print} top-[130px] right-0 w-[44%] rotate-[5deg] md:top-[190px]`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static sample photos */}
            <img
              src="/prototype/photos/nezu-shrine.jpg"
              alt=""
              className={`${photo} aspect-square`}
            />
          </div>
          <div className="absolute bottom-0 left-0 w-[80%] -rotate-[1.5deg] shadow-print md:w-[350px]">
            <TicketStub
              time="14:05"
              title="NH 212 to Haneda"
              note="Mon 10 May · flight"
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="trips-heading"
        className="border-t border-ink/12 pt-12"
      >
        <h2
          id="trips-heading"
          className="text-[30px] leading-[1.06] tracking-[-0.03em] md:text-[44px]"
        >
          Your other trips
        </h2>
        <ul className="mt-8 grid gap-10 md:grid-cols-[1.25fr_1fr]">
          {others.map((trip) => (
            <li key={trip.id}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- static sample photos */}
                <img
                  src={trip.photo}
                  alt=""
                  className={`${photo} aspect-[16/10] rounded-md`}
                />
                {trip.stamp && (
                  <span className="absolute right-3 bottom-4">
                    <Stamp
                      label={trip.stamp}
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
                · {trip.dates}
              </p>
              <h3 className="mt-1.5 text-[27px] leading-[1.12] tracking-[-0.02em] [overflow-wrap:anywhere]">
                {trip.title}
              </h3>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="memory-heading"
        className="mt-16 grid gap-6 border-t border-ink/12 pt-12 md:grid-cols-[300px_minmax(0,1fr)] md:gap-14"
      >
        <div>
          <p className={eyebrow}>What I remember</p>
          <h2
            id="memory-heading"
            className="mt-1 text-[30px] leading-[1.06] tracking-[-0.03em] md:text-[44px]"
          >
            Your taste, <em>so far</em>
          </h2>
          <p className="mt-3 text-base text-muted">
            Every trip teaches me a little more. You can change or remove
            anything.
          </p>
          <Link href="/prototype/profile" className={`${quiet} mt-3`}>
            See everything I remember
          </Link>
        </div>
        <ul>
          {profileEntries.slice(0, 4).map((entry) => (
            <li
              key={`${entry.topic}-${entry.value}`}
              className="grid gap-x-6 gap-y-1 border-b border-ink/12 py-4 first:pt-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-baseline"
            >
              <span className="font-serif text-[21px] italic first-letter:uppercase md:text-[24px]">
                {entry.value}
              </span>
              <span className="font-sans text-[13px] text-muted">
                {entry.topic} · {entry.source}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-16 font-sans text-[11px] text-muted">
        Photographs from Wikimedia Commons:{" "}
        {homeTrips.map((trip) => trip.photoCredit).join("; ")}; BWard 1997, CC
        BY 4.0.
      </p>
    </>
  );
}

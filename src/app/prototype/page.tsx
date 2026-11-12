import Link from "next/link";

import { Stamp } from "@/components/keepsake/day-stamp";
import { Art } from "@/components/keepsake/place-art";
import { homeTrips } from "@/features/prototype/sample-home";

const stateLabel = { planning: "Planning", upcoming: "Upcoming", past: "Past" };

export default function PrototypeHome() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 py-4">
        <div>
          <h1 className="text-3xl font-bold">Your trips</h1>
          <p className="mt-1 italic">
            Welcome back. Tokyo is waiting on five choices.
          </p>
        </div>
        <Link
          href="/prototype/new"
          className="rounded-full bg-terracotta-deep px-5 py-2 font-sans text-sm font-semibold text-white"
        >
          New trip
        </Link>
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {homeTrips.map((trip) => (
          <li
            key={trip.id}
            className="relative bg-card p-2 shadow-[0_3px_10px_rgb(60_40_20/0.25)]"
          >
            <Art art={trip.art} label={trip.title} className="h-36" />
            {trip.stamp && (
              <span className="absolute top-5 right-5 bg-stamp-paper">
                <Stamp label={trip.stamp} spoken={`Visited: ${trip.title}`} />
              </span>
            )}
            <div className="px-1 py-3">
              <p className="font-sans text-[10px] font-bold tracking-widest text-terracotta uppercase">
                {stateLabel[trip.state]}
              </p>
              <h2 className="text-lg font-bold [overflow-wrap:anywhere]">
                {trip.title}
              </h2>
              <p className="text-sm opacity-75">{trip.dates}</p>
              {trip.state === "planning" && (
                <p className="mt-2 text-sm">
                  {trip.progress}.{" "}
                  <Link
                    href="/prototype/trip"
                    className="font-semibold text-terracotta underline"
                  >
                    Continue planning
                  </Link>
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

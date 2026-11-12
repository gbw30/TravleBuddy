"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { TicketStub } from "./ticket-stub";

type Ticket = { time: string; title: string; note?: string };

const field =
  "mt-1 block w-full rounded-md border border-row-edge bg-card px-3 py-2 font-sans text-sm text-ink";
const choice =
  "block rounded-lg border border-row-edge bg-row p-4 shadow-[0_2px_6px_rgb(60_40_20/0.15)]";
const toggle =
  "rounded-full border border-terracotta-deep px-5 py-2 font-sans text-sm font-semibold text-terracotta-deep aria-pressed:bg-terracotta-deep aria-pressed:text-white";

export function StartTrip() {
  const [hasTickets, setHasTickets] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  function addTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const departure = text("departure");
    setTickets((list) => [
      ...list,
      {
        time: departure.slice(11, 16) || "--:--",
        title: `${text("type")} · ${text("from")} → ${text("to")}`,
        note: [departure.slice(0, 10), text("reference")]
          .filter(Boolean)
          .join(" · "),
      },
    ]);
    event.currentTarget.reset();
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-3xl font-bold">Start a trip</h1>

      <section aria-labelledby="tickets-heading" className="mt-6">
        <p className="font-sans text-[10px] font-bold tracking-widest text-terracotta-deep uppercase">
          Step 1 of 2
        </p>
        <h2 id="tickets-heading" className="text-xl font-bold">
          Do you already have tickets?
        </h2>
        <p className="mt-1 italic">
          Flights or trains you have booked set your dates and cities.
        </p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            aria-pressed={hasTickets === true}
            onClick={() => setHasTickets(true)}
            className={toggle}
          >
            Yes
          </button>
          <button
            type="button"
            aria-pressed={hasTickets === false}
            onClick={() => setHasTickets(false)}
            className={toggle}
          >
            Not yet
          </button>
        </div>

        {hasTickets && (
          <>
            {tickets.length > 0 && (
              <ul className="mt-4 space-y-2">
                {tickets.map((ticket, index) => (
                  <li key={index}>
                    <TicketStub {...ticket} />
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={addTicket}
              className="mt-4 grid gap-3 rounded-lg border border-row-edge bg-row p-4 sm:grid-cols-2"
            >
              <label className="text-sm">
                Type
                <select name="type" className={field}>
                  <option>Flight</option>
                  <option>Train</option>
                </select>
              </label>
              <label className="text-sm">
                Booking reference (optional)
                <input name="reference" className={field} />
              </label>
              <label className="text-sm">
                From
                <input name="from" required className={field} />
              </label>
              <label className="text-sm">
                To
                <input name="to" required className={field} />
              </label>
              <label className="text-sm">
                Departure
                <input
                  name="departure"
                  type="datetime-local"
                  required
                  className={field}
                />
              </label>
              <label className="text-sm">
                Arrival
                <input
                  name="arrival"
                  type="datetime-local"
                  required
                  className={field}
                />
              </label>
              <button
                type="submit"
                className="justify-self-start rounded-full bg-terracotta-deep px-5 py-2 font-sans text-sm font-semibold text-white sm:col-span-2"
              >
                Add ticket
              </button>
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="plan-heading" className="mt-10">
        <p className="font-sans text-[10px] font-bold tracking-widest text-terracotta-deep uppercase">
          Step 2 of 2
        </p>
        <h2 id="plan-heading" className="text-xl font-bold">
          How do you want to plan?
        </h2>
        <p className="mt-1 italic">You can switch between these at any time.</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          <li>
            <Link href="/prototype/trip" className={choice}>
              <span className="block text-lg font-bold">Guided planning</span>
              <span className="block text-sm">
                Talk it through. I get to know you, then suggest places slot by
                slot.
              </span>
            </Link>
          </li>
          <li>
            <Link href="/prototype/quick-plan" className={choice}>
              <span className="block text-lg font-bold">Quick plan</span>
              <span className="block text-sm">
                Fill in a short trip brief and I build the whole trip for you to
                refine.
              </span>
            </Link>
          </li>
          {["Start from a template", "Build on someone's trip"].map((later) => (
            <li
              key={later}
              className="rounded-lg border-2 border-dashed border-row-edge p-4 opacity-80"
            >
              <span className="block text-lg font-bold">{later}</span>
              <span className="block font-sans text-xs font-semibold">
                Coming later
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

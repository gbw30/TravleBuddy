"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { TicketStub } from "./ticket-stub";
import {
  buttonLarge,
  cardTitle,
  chip,
  eyebrow,
  fieldLarge,
  pageTitle,
  panel,
  sectionTitle,
} from "./styles";

type Ticket = { time: string; title: string; note?: string };

const field = `${fieldLarge} mt-1 block w-full`;
const choice = `block h-full p-6 ${panel}`;
const toggle = chip;

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
    <div className="mx-auto max-w-2xl py-10 md:py-14">
      <h1 className={pageTitle}>
        Start a <em>trip</em>
      </h1>

      <section aria-labelledby="tickets-heading" className="mt-10">
        <p className={eyebrow}>Step 1 of 2</p>
        <h2 id="tickets-heading" className={`mt-2 ${sectionTitle}`}>
          Do you already have tickets?
        </h2>
        <p className="mt-2 text-ink/75 italic">
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
              className={`mt-5 grid gap-4 p-6 sm:grid-cols-2 ${panel}`}
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
                className={`${buttonLarge} justify-self-start sm:col-span-2`}
              >
                Add ticket
              </button>
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="plan-heading" className="mt-14">
        <p className={eyebrow}>Step 2 of 2</p>
        <h2 id="plan-heading" className={`mt-2 ${sectionTitle}`}>
          How do you want to plan?
        </h2>
        <p className="mt-2 text-ink/75 italic">
          You can switch between these at any time.
        </p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          <li>
            <Link href="/prototype/trip" className={choice}>
              <span className={`block ${cardTitle}`}>Guided planning</span>
              <span className="mt-1.5 block text-[15px] text-ink/75">
                Talk it through. I get to know you, then suggest places slot by
                slot.
              </span>
            </Link>
          </li>
          <li>
            <Link href="/prototype/quick-plan" className={choice}>
              <span className={`block ${cardTitle}`}>Quick plan</span>
              <span className="mt-1.5 block text-[15px] text-ink/75">
                Fill in a short trip brief and I build the whole trip for you to
                refine.
              </span>
            </Link>
          </li>
          {["Start from a template", "Build on someone's trip"].map((later) => (
            <li
              key={later}
              className="rounded-[14px] border-[1.5px] border-dashed border-ink/25 p-6 text-muted"
            >
              <span className={`block ${cardTitle}`}>{later}</span>
              <span className="mt-1 block font-sans text-xs">Coming later</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

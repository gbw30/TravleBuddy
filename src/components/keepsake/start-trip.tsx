"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";

import {
  TICKET_MODES,
  ticketInputSchema,
  type PlanningMode,
  type TicketInput,
} from "@/features/trips/contracts";
import { callApi } from "@/lib/trip-api";

import { Stamp } from "./day-stamp";
import {
  button,
  buttonArrow,
  buttonLarge,
  eyebrow,
  fieldLarge,
  lift,
  pageTitle,
  quiet,
  sectionTitle,
} from "./styles";
import { TicketStub } from "./ticket-stub";

/** Where the sample prototype goes instead of saving a trip. */
export type SampleLinks = { together: string; brief: string; back: string };

const ways = {
  together: {
    mode: "GUIDED" as PlanningMode,
    title: "Plan it together",
    text: "I ask a few questions, then show you three places at a time. You pick, and the trip takes shape.",
    time: "About 15 minutes",
    note: "you choose every stop",
    go: "Start planning together",
  },
  brief: {
    mode: "QUICK" as PlanningMode,
    title: "Build it for me",
    text: "Fill in one short brief. I build the whole trip and tell you what I assumed. Then you refine it.",
    time: "About 3 minutes",
    note: "change anything after",
    go: "Fill in the brief",
  },
};
type Way = keyof typeof ways;

const typeWord: Record<TicketInput["mode"], string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  FERRY: "Ferry",
};
const label =
  "block font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase";
const input = `${fieldLarge} mt-1.5 block h-12 w-full tracking-normal normal-case`;
// Blocks arrive one after another, in reading order.
const rise = (i: number) => ({ "--i": i }) as CSSProperties;
const miniPrint =
  "absolute w-[92px] rounded-[3px] bg-card p-[5px] pb-[17px] shadow-[0_6px_14px_rgb(29_26_22/0.18)]";

/**
 * The start of a trip: tickets already held, then how to plan (PRD 5). With
 * `sample` it is the design prototype and saves nothing; without, it creates
 * the trip and opens it.
 */
export function StartTrip({ sample }: { sample?: SampleLinks }) {
  const router = useRouter();
  const [way, setWay] = useState<Way>("together");
  const [addingTickets, setAddingTickets] = useState(false);
  const [tickets, setTickets] = useState<TicketInput[]>([]);
  const [draft, setDraft] = useState({ to: "", time: "", reference: "" });
  const [ticketProblem, setTicketProblem] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function addTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ticketInputSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setTicketProblem(
        parsed.error.issues[0]?.path[0] === "arriveDate"
          ? "The arrival is before the departure. Check the two dates."
          : "Fill in where from, where to, and both dates and times.",
      );
      return;
    }
    setTicketProblem(null);
    setTickets((list) => [...list, parsed.data]);
    event.currentTarget.reset();
    setDraft({ to: "", time: "", reference: "" });
  }

  async function begin() {
    setStarting(true);
    setProblem(null);
    const result = await callApi<{ trip: { id: string } }>("/api/v1/trips", {
      method: "POST",
      body: { tickets, planningMode: ways[way].mode },
    });
    if (result.ok) {
      router.push(`/trips/${result.data.trip.id}`);
      return;
    }
    setStarting(false);
    setProblem(result.message);
  }

  return (
    <div className="grid items-start gap-16 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20 lg:py-14">
      <div className="min-w-0">
        <p
          className="rise inline-flex h-8 items-center gap-2.5 rounded-full bg-card pr-3.5 pl-1.5 text-[13px] text-ink/75 shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
          style={rise(0)}
        >
          <span className="inline-flex h-[22px] items-center rounded-full bg-ink px-2.5 font-mono text-[10.5px] tracking-[0.1em] text-paper uppercase">
            New trip
          </span>
          Two questions · about a minute
        </p>
        <h1 className={`rise mt-6 ${pageTitle}`} style={rise(1)}>
          Where to <em>next?</em>
        </h1>
        <p
          className="rise mt-5 max-w-[31rem] text-lg text-ink/75"
          style={rise(2)}
        >
          Nothing here is final. You can change your mind at any point, and I
          will rebuild around it.
        </p>

        <ol
          aria-label="Progress"
          className="rise mt-10 flex items-center gap-2.5 text-[13.5px] text-muted sm:gap-3.5"
          style={rise(3)}
        >
          {["Tickets", "How to plan", "Begin"].map((step, index) => (
            <li
              key={step}
              aria-current={index === 1 ? "step" : undefined}
              className="flex items-center gap-2.5 aria-[current=step]:font-medium aria-[current=step]:text-ink sm:gap-3.5"
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={`h-[1.5px] w-5 sm:w-14 ${index === 1 ? "bg-ink" : "bg-ink/20"}`}
                />
              )}
              <span
                className={`grid size-[26px] shrink-0 place-items-center rounded-full font-mono text-[11px] ${index === 0 ? "bg-ink text-paper" : index === 1 ? "shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : "shadow-[inset_0_0_0_1.5px_rgb(29_26_22/0.25)]"}`}
              >
                {index === 0 ? "✓" : index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <section
          aria-label="Your tickets"
          className="rise mt-6 rounded-xl bg-card shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
          style={rise(4)}
        >
          <div className="flex items-center gap-3.5 px-[18px] py-3 text-[15px]">
            <span className="font-medium">Tickets</span>
            <span className="flex-1 text-muted">
              {tickets.length === 0
                ? "Not booked yet"
                : `${tickets.length} added`}
            </span>
            <button
              type="button"
              aria-expanded={addingTickets}
              className={quiet}
              onClick={() => setAddingTickets((open) => !open)}
            >
              {addingTickets ? "Done" : "Change"}
            </button>
          </div>

          {addingTickets && (
            <div className="border-t border-dashed border-ink/15 p-[18px] [--notch:var(--color-card)]">
              <p className="max-w-[32rem] text-[15px] text-muted">
                Flights or trains you have booked decide your dates and cities,
                so I start from them. Only where and when matter.
              </p>
              {tickets.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {tickets.map((ticket, index) => (
                    <li key={index}>
                      <TicketStub
                        time={ticket.arriveTime}
                        title={`${typeWord[ticket.mode]} · ${ticket.from} → ${ticket.to}`}
                        note={[ticket.arriveDate, ticket.reference]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      <button
                        type="button"
                        className={quiet}
                        onClick={() =>
                          setTickets((list) =>
                            list.filter((_, at) => at !== index),
                          )
                        }
                      >
                        Remove
                        <span className="sr-only">
                          {" "}
                          the ticket to {ticket.to}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Shaped like a boarding pass: the form on the left, what it becomes on the right. */}
              <form
                onSubmit={addTicket}
                className="mt-5 grid rounded-2xl bg-paper/60 shadow-[inset_0_0_0_1px_rgb(29_26_22/0.12)] md:grid-cols-[minmax(0,1fr)_210px]"
              >
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <fieldset className="flex w-fit gap-1 rounded-full bg-tint p-1 sm:col-span-2">
                    <legend className="sr-only">Kind of ticket</legend>
                    {TICKET_MODES.map((type, index) => (
                      <label
                        key={type}
                        className="cursor-pointer rounded-full px-3.5 py-1.5 text-[13.5px] text-ink/75 transition-colors duration-150 has-checked:bg-card has-checked:font-medium has-checked:text-ink has-checked:shadow-[0_1px_3px_rgb(29_26_22/0.14)] has-focus-visible:outline-2 has-focus-visible:outline-terracotta"
                      >
                        <input
                          type="radio"
                          name="mode"
                          value={type}
                          defaultChecked={index === 0}
                          className="sr-only"
                        />
                        {typeWord[type]}
                      </label>
                    ))}
                  </fieldset>
                  <label className={label}>
                    From
                    <input name="from" required className={input} />
                  </label>
                  <label className={label}>
                    To
                    <input
                      name="to"
                      required
                      className={input}
                      value={draft.to}
                      onChange={(e) =>
                        setDraft({ ...draft, to: e.target.value })
                      }
                    />
                  </label>
                  <label className={label}>
                    Leaves on
                    <input
                      name="departDate"
                      type="date"
                      required
                      className={input}
                    />
                  </label>
                  <label className={label}>
                    Leaves at
                    <input
                      name="departTime"
                      type="time"
                      required
                      className={input}
                    />
                  </label>
                  <label className={label}>
                    Arrives on
                    <input
                      name="arriveDate"
                      type="date"
                      required
                      className={input}
                    />
                  </label>
                  <label className={label}>
                    Arrives at
                    <input
                      name="arriveTime"
                      type="time"
                      required
                      className={input}
                      value={draft.time}
                      onChange={(e) =>
                        setDraft({ ...draft, time: e.target.value })
                      }
                    />
                  </label>
                  <label className={`${label} sm:col-span-2`}>
                    Flight or train number · optional
                    <input
                      name="reference"
                      className={input}
                      value={draft.reference}
                      onChange={(e) =>
                        setDraft({ ...draft, reference: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="flex flex-col gap-4 border-t border-dashed border-ink/15 p-5 md:border-t-0 md:border-l">
                  <p className={eyebrow}>On your itinerary</p>
                  <p aria-live="polite">
                    <span className="block font-serif text-[40px] leading-none tracking-[-0.02em]">
                      {draft.time || "--:--"}
                    </span>
                    <span className="mt-2 block text-[13px] text-muted">
                      {draft.to
                        ? `${draft.reference || "Arrive"} · ${draft.to}`
                        : "Your arrival will show here"}
                    </span>
                  </p>
                  <p role="alert" className="text-[13px] text-stamp">
                    {ticketProblem}
                  </p>
                  <button
                    type="submit"
                    className={`${button} mt-auto self-start`}
                  >
                    Add this ticket
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        <section
          aria-labelledby="plan-heading"
          className="rise mt-10"
          style={rise(5)}
        >
          <p className={eyebrow}>Question 2 of 2</p>
          <h2 id="plan-heading" className={`mt-2.5 ${sectionTitle}`}>
            How would you like to <em>plan?</em>
          </h2>
          <p className="mt-2.5 text-[16.5px] text-muted">
            Both end in the same place: an itinerary you can keep changing.
          </p>
          <div
            role="radiogroup"
            aria-labelledby="plan-heading"
            className="mt-7 grid gap-[18px] sm:grid-cols-2"
          >
            {(Object.keys(ways) as Way[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={way === key}
                onClick={() => setWay(key)}
                className={`group/choice relative overflow-hidden rounded-2xl bg-card text-left shadow-[0_0_0_1px_rgb(29_26_22/0.12),var(--shadow-sheet)] active:scale-[0.98] aria-checked:shadow-[0_0_0_2px_var(--color-ink),var(--shadow-sheet)] ${lift}`}
              >
                {key === "together" && (
                  <span className="absolute top-3.5 left-3.5 z-[2] rounded-full bg-ink px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-paper uppercase">
                    Best for a first trip
                  </span>
                )}
                <span
                  aria-hidden
                  className="absolute top-3.5 right-3.5 z-[2] grid size-6 place-items-center rounded-full bg-card text-xs text-paper shadow-[inset_0_0_0_1.5px_rgb(29_26_22/0.3)] transition-colors duration-150 group-aria-checked/choice:bg-ink group-aria-checked/choice:shadow-none"
                >
                  ✓
                </span>
                <span
                  aria-hidden
                  className="relative block h-[156px] overflow-hidden bg-tint"
                >
                  {key === "together" ? (
                    ["meiji-jingu", "senso-ji", "nezu-shrine"].map(
                      (photo, index) => (
                        <span
                          key={photo}
                          className={`${miniPrint} ${["top-[38px] left-[calc(50%-124px)] -rotate-[7deg]", "top-6 left-[calc(50%-46px)] z-[1]", "top-10 left-[calc(50%+32px)] rotate-6"][index]}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- static sample photos */}
                          <img
                            src={`/prototype/photos/${photo}.jpg`}
                            alt=""
                            className="aspect-[4/3] w-full rounded-[1px] object-cover"
                          />
                        </span>
                      ),
                    )
                  ) : (
                    <span className="absolute top-[22px] left-1/2 grid w-[200px] -translate-x-1/2 -rotate-2 gap-2 rounded-lg bg-card p-3.5 shadow-[0_6px_14px_rgb(29_26_22/0.16)]">
                      <span className="h-4 w-[55%] rounded bg-tint" />
                      <span className="h-4 rounded shadow-[inset_0_0_0_1px_rgb(29_26_22/0.12)]" />
                      <span className="h-4 rounded bg-tint" />
                      <span className="h-4 rounded border border-dashed border-ink/25" />
                      <span className="h-4 w-4/5 rounded bg-tint" />
                    </span>
                  )}
                </span>
                <span className="block px-6 pt-[22px]">
                  <span className="block font-serif text-[29px] leading-[1.05] tracking-[-0.02em]">
                    {ways[key].title}
                  </span>
                  <span className="mt-2.5 block text-[15px] leading-normal text-ink/75">
                    {ways[key].text}
                  </span>
                </span>
                <span className="mx-6 mt-[18px] flex items-center gap-2 border-t border-ink/12 pt-3.5 pb-[18px] text-[13px] text-muted">
                  <span>
                    <span className="font-medium text-ink">
                      {ways[key].time}
                    </span>{" "}
                    · {ways[key].note}
                  </span>
                  <span
                    aria-hidden
                    className="ml-auto grid size-[30px] shrink-0 place-items-center rounded-full text-ink shadow-[inset_0_0_0_1.5px_rgb(29_26_22/0.25)] transition-colors duration-150 group-hover/choice:bg-ink group-hover/choice:text-paper group-hover/choice:shadow-none group-aria-checked/choice:bg-ink group-aria-checked/choice:text-paper group-aria-checked/choice:shadow-none"
                  >
                    →
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-muted">
            Coming later: start from a template, or build on someone else’s
            trip.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            {sample ? (
              <Link href={sample[way]} className={buttonLarge}>
                {ways[way].go}
                <span aria-hidden className={buttonArrow}>
                  →
                </span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={starting}
                onClick={begin}
                className={buttonLarge}
              >
                {starting ? "Starting your trip…" : ways[way].go}
                <span aria-hidden className={buttonArrow}>
                  →
                </span>
              </button>
            )}
            <Link href={sample?.back ?? "/home"} className={quiet}>
              Back
            </Link>
          </div>
          <p role="alert" className="mt-3 text-[15px] text-stamp">
            {problem}
          </p>
        </section>
      </div>

      {/* Keepsakes beside the questions: a print, a postmark and a postcard waiting to be written. */}
      <aside
        aria-hidden
        className="rise relative hidden h-[600px] lg:block"
        style={rise(2)}
      >
        <svg
          viewBox="0 0 560 640"
          fill="none"
          className="absolute -inset-x-10 -top-5 bottom-0 stroke-terracotta/35"
        >
          {[120, 138, 156, 174, 192].map((y) => (
            <path
              key={y}
              d={`M0 ${y}c70-30 140 30 210 0s140-30 210 0 140 30 210 0`}
            />
          ))}
          <circle cx="470" cy="150" r="62" />
          <circle cx="470" cy="150" r="54" />
          <path d="M20 600C140 470 300 440 520 520" strokeDasharray="3 7" />
        </svg>
        <div className="absolute top-2 left-14 w-[330px] rotate-[2.5deg] rounded-[4px] bg-card p-2.5 shadow-print">
          {/* eslint-disable-next-line @next/next/no-img-element -- static sample photos */}
          <img
            src="/prototype/photos/alfama-tram.jpg"
            alt=""
            className="aspect-[3/3.7] w-full rounded-[2px] object-cover outline outline-1 -outline-offset-1 outline-black/10"
          />
        </div>
        <span className="absolute top-[430px] -right-3 rotate-[14deg]">
          <Stamp label="PAR AVION" spoken="" />
        </span>
        <div className="absolute bottom-6 left-0 w-[300px] -rotate-[4deg] rounded-[4px] bg-stamp-paper px-6 pt-6 pb-8 shadow-print">
          <span className="absolute top-[18px] right-[18px] grid h-[62px] w-[52px] place-items-center rounded-[2px] border-[1.5px] border-dashed border-ink/30 text-center font-mono text-[7.5px] leading-snug tracking-[0.1em] text-muted">
            PLACE STAMP HERE
          </span>
          <p className="font-serif text-[28px] leading-[1.12] italic">
            Your next trip
            <br />
            starts here.
          </p>
          <span className="mt-[18px] block h-px w-[62%] bg-ink/12 shadow-[0_14px_0_rgb(29_26_22/0.12),0_28px_0_rgb(29_26_22/0.12)]" />
        </div>
      </aside>
    </div>
  );
}

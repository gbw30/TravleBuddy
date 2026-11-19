"use client";

import { useState, type FormEvent } from "react";

import type { Commitment } from "@/features/prototype/types";

import { eyebrow, field, button } from "./styles";
import { TicketStub } from "./ticket-stub";

const kinds: Commitment["kind"][] = [
  "transport",
  "stay",
  "reservation",
  "must-see",
  "other",
];

export function CommitmentsPanel({ initial }: { initial: Commitment[] }) {
  const [commitments, setCommitments] = useState(initial);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    if (!text("title")) return;
    setCommitments((list) => [
      ...list,
      {
        id: `c-${list.length + 1}`,
        kind: text("kind") as Commitment["kind"],
        title: text("title"),
        date: text("date") || "Date to be set",
        time: text("time") || null,
      },
    ]);
    event.currentTarget.reset();
  }

  return (
    <section data-qa="commitments" aria-labelledby="commitments-heading">
      <h2 id="commitments-heading" className={eyebrow}>
        Already decided
      </h2>
      <ul className="mt-2 space-y-2">
        {commitments.map((c) => (
          <li key={c.id}>
            {c.time ? (
              <TicketStub
                time={c.time}
                title={c.title}
                note={`${c.date} · ${c.kind}`}
              />
            ) : (
              <div className="rounded-lg border-[1.5px] border-dashed border-ink/25 px-4 py-3 text-[15px]">
                <span className="block [overflow-wrap:anywhere]">
                  {c.title}
                </span>
                <span className="block font-sans text-xs text-muted">
                  {c.date} · {c.kind} · no time yet, I will fit it in first
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-0.5 font-sans text-[13px] text-ink underline decoration-ink/25 underline-offset-4">
          Add something already decided
        </summary>
        <form onSubmit={add} className="mt-2 grid gap-2 sm:grid-cols-2">
          <label>
            What
            <input
              name="title"
              required
              className={`${field} mt-1 block w-full`}
            />
          </label>
          <label>
            Kind
            <select name="kind" className={`${field} mt-1 block w-full`}>
              {kinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              name="date"
              type="date"
              className={`${field} mt-1 block w-full`}
            />
          </label>
          <label>
            Time (optional)
            <input
              name="time"
              type="time"
              className={`${field} mt-1 block w-full`}
            />
          </label>
          <button type="submit" className={`${button} justify-self-start`}>
            Add
          </button>
        </form>
      </details>
    </section>
  );
}

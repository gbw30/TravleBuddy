"use client";

import { useState, type FormEvent } from "react";

import type { Commitment } from "@/features/prototype/types";

import { eyebrow, field, pillPrimary } from "./styles";
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
              <div className="rounded-lg border border-dashed border-terracotta bg-row px-4 py-2 text-sm">
                <span className="block [overflow-wrap:anywhere]">
                  {c.title}
                </span>
                <span className="block text-xs opacity-75">
                  {c.date} · {c.kind} · no time yet, I will fit it in first
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-sans text-xs font-semibold text-terracotta-deep">
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
          <button type="submit" className={`${pillPrimary} justify-self-start`}>
            Add
          </button>
        </form>
      </details>
    </section>
  );
}

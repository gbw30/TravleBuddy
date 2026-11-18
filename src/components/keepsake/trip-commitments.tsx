"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  COMMITMENT_KINDS,
  commitmentInputSchema,
  type Clash,
  type CommitmentDto,
  type CommitmentKind,
} from "@/features/trips/contracts";
import { changeTrip } from "@/lib/trip-api";

import { dayLabel } from "./format";
import { button, buttonSecond, eyebrow, field, quiet } from "./styles";
import { TicketStub } from "./ticket-stub";

const kindWord: Record<CommitmentKind, string> = {
  TRANSPORT: "Transport",
  STAY: "Stay",
  RESERVATION: "Reservation",
  MUST_SEE: "Must-see",
  OTHER: "Other",
};
const label = "block font-sans text-[13px] text-muted";
const control = `${field} mt-1 block w-full`;

type Saved = { commitments: CommitmentDto[]; clashes: Clash[] };

function CommitmentForm({
  commitment,
  submitWord,
  busy,
  onSubmit,
  onCancel,
}: {
  commitment?: CommitmentDto;
  submitWord: string;
  busy: boolean;
  onSubmit: (input: object, form: HTMLFormElement) => void;
  onCancel?: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = [...new FormData(event.currentTarget)].map(
      ([name, value]) => [name, value === "" ? null : value],
    );
    const parsed = commitmentInputSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setProblem(null);
    onSubmit(parsed.data, event.currentTarget);
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className={`${label} sm:col-span-2`}>
        What
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={commitment?.title}
          className={control}
        />
      </label>
      <label className={label}>
        Kind
        <select
          name="kind"
          defaultValue={commitment?.kind ?? "RESERVATION"}
          className={control}
        >
          {COMMITMENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kindWord[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Date
        <input
          name="date"
          type="date"
          defaultValue={commitment?.date ?? ""}
          className={control}
        />
      </label>
      <label className={label}>
        Starts at · optional
        <input
          name="startTime"
          type="time"
          defaultValue={commitment?.startTime ?? ""}
          className={control}
        />
      </label>
      <label className={label}>
        Ends at · optional
        <input
          name="endTime"
          type="time"
          defaultValue={commitment?.endTime ?? ""}
          className={control}
        />
      </label>
      <label className={label}>
        Ends on another day · optional
        <input
          name="endDate"
          type="date"
          defaultValue={commitment?.endDate ?? ""}
          className={control}
        />
      </label>
      <label className={label}>
        Booking reference · optional
        <input
          name="reference"
          maxLength={80}
          defaultValue={commitment?.reference ?? ""}
          className={control}
        />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Note · optional
        <input
          name="note"
          maxLength={500}
          defaultValue={commitment?.note ?? ""}
          className={control}
        />
      </label>
      <p role="alert" className="text-[13px] text-stamp sm:col-span-2">
        {problem}
      </p>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={button}>
          {submitWord}
        </button>
        {onCancel && (
          <button type="button" className={buttonSecond} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Things already decided (PRD 10). With a time a commitment is a ticket stub;
 * without one it is a must-include. Clashing commitments are both kept and
 * pointed out: the traveller decides between them (TB-FIX-06).
 */
export function TripCommitments({
  tripId,
  revision,
  initial,
  readOnly,
}: {
  tripId: string;
  revision: number;
  initial: Saved;
  readOnly: boolean;
}) {
  const router = useRouter();
  // What our own last change returned, shown until the page reloads past it.
  const [local, setLocal] = useState<{ revision: number; saved: Saved } | null>(
    null,
  );
  const { commitments, clashes } =
    local && local.revision >= revision ? local.saved : initial;
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleOf = (id: string) =>
    commitments.find((commitment) => commitment.id === id)?.title ?? "another";

  async function send(
    method: "POST" | "PATCH" | "DELETE",
    commitmentId: string | null,
    body?: object,
  ) {
    setBusy(true);
    setProblem(null);
    const result = await changeTrip<Saved>(
      tripId,
      revision,
      method,
      body,
      commitmentId ? `/commitments/${commitmentId}` : "/commitments",
    );
    setBusy(false);
    if (result.ok) {
      if (result.revision !== null) {
        setLocal({ revision: result.revision, saved: result.data });
      }
    } else {
      setProblem(result.message);
    }
    router.refresh();
    return result.ok;
  }

  return (
    <section data-qa="commitments" aria-labelledby="commitments-heading">
      <h2 id="commitments-heading" className={eyebrow}>
        Already decided
      </h2>
      <p role="alert" className="mt-1 text-[14px] text-stamp">
        {clashes.length > 0 &&
          `${clashes.length === 1 ? "Two of these overlap" : "Some of these overlap"}. I have kept them all; change whichever is wrong.`}
        {problem && ` ${problem}`}
      </p>
      {commitments.length === 0 && (
        <p className="mt-2 text-[15px] text-muted">
          Nothing yet. Add a booked flight, a hotel, a reservation or a sight
          you will not miss, and I will plan around it.
        </p>
      )}
      <ul className="mt-2 space-y-3">
        {commitments.map((c) => {
          const against = clashes
            .filter((clash) => clash.first === c.id || clash.second === c.id)
            .map((clash) =>
              titleOf(clash.first === c.id ? clash.second : clash.first),
            );
          const note = [
            c.date ? dayLabel(c.date) : "Date to be set",
            kindWord[c.kind],
            // A ticket's end is its arrival, perhaps on another day.
            c.endTime &&
              `${c.kind === "TRANSPORT" ? "arrives" : "until"} ${c.endDate && c.endDate !== c.date ? `${dayLabel(c.endDate).slice(0, -5)} ` : ""}${c.endTime}`,
            c.reference,
          ]
            .filter(Boolean)
            .join(" · ");

          if (editing === c.id) {
            return (
              <li key={c.id} className="rounded-lg bg-card p-4 shadow-sheet">
                <p className="font-sans text-[13px] font-medium">
                  Change “{c.title}”
                </p>
                <CommitmentForm
                  commitment={c}
                  submitWord="Save changes"
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (commitment) => {
                    const saved = await send("PATCH", c.id, { commitment });
                    if (saved) setEditing(null);
                  }}
                />
              </li>
            );
          }

          return (
            <li key={c.id}>
              {c.startTime ? (
                <TicketStub time={c.startTime} title={c.title} note={note} />
              ) : (
                <div className="rounded-lg border-[1.5px] border-dashed border-ink/25 px-4 py-3 text-[15px]">
                  <span className="block [overflow-wrap:anywhere]">
                    {c.title}
                  </span>
                  <span className="block font-sans text-xs text-muted">
                    {note} · no time yet, I will fit it in first
                  </span>
                </div>
              )}
              {c.note && (
                <p className="mt-1 font-sans text-[13px] text-muted [overflow-wrap:anywhere]">
                  {c.note}
                </p>
              )}
              {against.length > 0 && (
                <p className="mt-1 font-sans text-[13px] font-medium text-stamp">
                  Overlaps with {against.join(" and ")}.
                </p>
              )}
              {!readOnly && (
                <div className="flex gap-x-5">
                  <button
                    type="button"
                    className={quiet}
                    onClick={() => setEditing(c.id)}
                  >
                    Change
                    <span className="sr-only"> {c.title}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={quiet}
                    onClick={() => send("DELETE", c.id)}
                  >
                    Remove
                    <span className="sr-only"> {c.title}</span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <details className="mt-4">
          <summary className="cursor-pointer font-sans text-[13px] font-medium text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4">
            Add something already decided
          </summary>
          <CommitmentForm
            submitWord="Add"
            busy={busy}
            onSubmit={async (commitment, form) => {
              if (await send("POST", null, { commitment })) form.reset();
            }}
          />
        </details>
      )}
    </section>
  );
}

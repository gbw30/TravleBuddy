"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { callApi, changeTrip } from "@/lib/trip-api";

import { button, buttonSecond, field, quiet } from "./styles";

type Trip = { id: string; title: string; revision: number; archived: boolean };

/** Rename, archive or restore, and delete a trip from Home (TB-HOM-03). */
export function TripCardActions({
  trip,
  afterDelete,
}: {
  trip: Trip;
  /** Where to go once the trip is deleted, when the page showing it is the trip itself. */
  afterDelete?: string;
}) {
  const router = useRouter();
  const confirm = useRef<HTMLDialogElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const path = `/api/v1/trips/${trip.id}`;

  async function run(work: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setProblem(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) setProblem(result.message ?? null);
    // Also after a refusal: the page then shows what is really saved.
    router.refresh();
    return result.ok;
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "");
    const saved = await run(() =>
      changeTrip(trip.id, trip.revision, "PATCH", { action: "rename", title }),
    );
    if (saved) setRenaming(false);
  }

  return (
    <div className="mt-2">
      {renaming ? (
        <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 font-sans text-[13px] text-muted">
            New name
            <input
              name="title"
              defaultValue={trip.title}
              required
              maxLength={120}
              autoFocus
              className={`${field} mt-1 block w-full`}
            />
          </label>
          <button type="submit" disabled={busy} className={button}>
            Save
          </button>
          <button
            type="button"
            className={quiet}
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-x-5">
          {!trip.archived && (
            <button
              type="button"
              className={quiet}
              onClick={() => setRenaming(true)}
            >
              Rename
              <span className="sr-only"> {trip.title}</span>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className={quiet}
            onClick={() =>
              run(() =>
                changeTrip(trip.id, trip.revision, "PATCH", {
                  action: trip.archived ? "restore" : "archive",
                }),
              )
            }
          >
            {trip.archived ? "Restore" : "Archive"}
            <span className="sr-only"> {trip.title}</span>
          </button>
          <button
            type="button"
            className={quiet}
            onClick={() => confirm.current?.showModal()}
          >
            Delete
            <span className="sr-only"> {trip.title}</span>
          </button>
        </div>
      )}
      <p role="status" className="font-sans text-[13px] text-stamp">
        {problem}
      </p>

      <dialog
        ref={confirm}
        aria-labelledby={`delete-${trip.id}`}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl bg-card p-7 text-ink shadow-lift backdrop:bg-ink/40"
      >
        <h3
          id={`delete-${trip.id}`}
          className="font-serif text-[26px] leading-tight"
        >
          Delete this trip?
        </h3>
        <p className="mt-3 text-[15px] text-ink/80 [overflow-wrap:anywhere]">
          “{trip.title}” and everything in it will be removed. This cannot be
          undone.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            className={button}
            onClick={async () => {
              const deleted = await run(() =>
                callApi(path, { method: "DELETE" }),
              );
              confirm.current?.close();
              if (deleted && afterDelete) router.push(afterDelete);
            }}
          >
            Delete trip
          </button>
          <button
            type="button"
            className={buttonSecond}
            onClick={() => confirm.current?.close()}
          >
            Keep it
          </button>
        </div>
      </dialog>
    </div>
  );
}

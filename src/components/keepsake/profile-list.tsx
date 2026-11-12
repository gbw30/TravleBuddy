"use client";

import { useState, type FormEvent } from "react";

import {
  profileTopics,
  type ProfileEntry,
  type ProfileTopic,
} from "@/features/prototype/sample-home";

const field =
  "rounded-md border border-row-edge bg-card px-3 py-1.5 font-sans text-sm text-ink";
const small =
  "rounded-full border border-terracotta-deep px-3 py-1 font-sans text-xs font-semibold text-terracotta-deep";

export function ProfileList({ initial }: { initial: ProfileEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<ProfileEntry | null>(null);

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = String(data.get("value") ?? "").trim();
    if (!value) return;
    setEntries((list) => [
      ...list,
      {
        topic: data.get("topic") as ProfileTopic,
        value,
        kind: data.get("hard") ? "hard limit" : "taste",
        sureness: "always",
        source: "you told me",
      },
    ]);
    event.currentTarget.reset();
  }

  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="text-3xl font-bold">What I remember about you</h1>
      <p className="mt-1 italic">
        A starting point for each new trip. What you say about a trip always
        wins over this.
      </p>

      {entries.length === 0 && (
        <p className="mt-6">
          Nothing yet. I will start fresh on your next trip.
        </p>
      )}

      {profileTopics
        .filter((topic) => entries.some((e) => e.topic === topic))
        .map((topic) => (
          <section key={topic} className="mt-6">
            <h2 className="font-sans text-xs font-bold tracking-widest text-terracotta-deep uppercase">
              {topic}
            </h2>
            <ul className="mt-2 space-y-2">
              {entries
                .filter((e) => e.topic === topic)
                .map((entry) => (
                  <li
                    key={entry.value}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-row-edge bg-row px-3 py-2"
                  >
                    {editing === entry ? (
                      <form
                        className="flex min-w-0 flex-1 gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = String(
                            new FormData(event.currentTarget).get("value"),
                          ).trim();
                          setEntries((list) =>
                            list.map((e) =>
                              e === entry && value
                                ? {
                                    ...e,
                                    value,
                                    sureness: "always",
                                    source: "you told me",
                                  }
                                : e,
                            ),
                          );
                          setEditing(null);
                        }}
                      >
                        <input
                          name="value"
                          defaultValue={entry.value}
                          aria-label={`Edit ${entry.value}`}
                          className={`${field} min-w-0 flex-1`}
                        />
                        <button type="submit" className={small}>
                          Save
                        </button>
                      </form>
                    ) : (
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        <span className="font-bold">{entry.value}</span>
                        <span className="block text-sm">
                          {entry.kind === "hard limit" ? (
                            <strong className="font-sans text-xs tracking-wide text-stamp uppercase">
                              Hard limit
                            </strong>
                          ) : (
                            "Taste"
                          )}{" "}
                          · {entry.sureness} · {entry.source}
                        </span>
                      </span>
                    )}
                    {editing !== entry && (
                      <button
                        type="button"
                        className={small}
                        aria-label={`Edit ${entry.value}`}
                        onClick={() => setEditing(entry)}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className={small}
                      aria-label={`Delete ${entry.value}`}
                      onClick={() =>
                        setEntries((list) => list.filter((e) => e !== entry))
                      }
                    >
                      Delete
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}

      <form
        onSubmit={addEntry}
        className="mt-8 flex flex-wrap items-end gap-3 rounded-lg border border-row-edge bg-row p-4"
      >
        <h2 className="basis-full text-lg font-bold">Add your own</h2>
        <label className="text-sm">
          Topic
          <select name="topic" className={`${field} mt-1 block`}>
            {profileTopics.map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </label>
        <label className="min-w-40 flex-1 text-sm">
          What should I remember?
          <input
            name="value"
            required
            className={`${field} mt-1 block w-full`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hard" /> Never break this
        </label>
        <button
          type="submit"
          className="rounded-full bg-terracotta-deep px-5 py-2 font-sans text-sm font-semibold text-white"
        >
          Add
        </button>
      </form>

      <button
        type="button"
        className={`${small} mt-6`}
        onClick={() => {
          if (window.confirm("Forget everything I remember about you?")) {
            setEntries([]);
          }
        }}
      >
        Reset everything
      </button>
    </div>
  );
}

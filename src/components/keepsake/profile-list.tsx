"use client";

import { useState, type FormEvent } from "react";
import {
  buttonLarge,
  cardTitle,
  eyebrow,
  fieldLarge,
  pageTitle,
  panel,
  quiet,
} from "./styles";

import {
  profileTopics,
  type ProfileEntry,
  type ProfileTopic,
} from "@/features/prototype/sample-home";

const field = fieldLarge;
const small = quiet;

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
    <div className="mx-auto max-w-3xl py-10 md:py-14">
      <h1 className={pageTitle}>What I remember about you</h1>
      <p className="mt-3 text-lg text-ink/75 italic">
        A starting point for each new trip. What you say about a trip always
        wins over this.
      </p>

      {entries.length === 0 && (
        <p className="mt-9">
          Nothing yet. I will start fresh on your next trip.
        </p>
      )}

      {profileTopics
        .filter((topic) => entries.some((e) => e.topic === topic))
        .map((topic) => (
          <section key={topic} className="mt-9">
            <h2 className={eyebrow}>{topic}</h2>
            <ul className="mt-1">
              {entries
                .filter((e) => e.topic === topic)
                .map((entry) => (
                  <li
                    key={entry.value}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink/12 py-4"
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
                        <span className="block text-[19px] leading-snug italic first-letter:uppercase">
                          {entry.value}
                        </span>
                        <span className="mt-0.5 block font-sans text-[13px] text-muted">
                          {entry.kind === "hard limit" ? (
                            <strong className="font-sans text-[11px] font-medium tracking-[0.14em] text-stamp uppercase">
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
        className={`mt-12 flex flex-wrap items-end gap-4 p-6 ${panel}`}
      >
        <h2 className={`basis-full ${cardTitle}`}>Add your own</h2>
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
        <button type="submit" className={buttonLarge}>
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

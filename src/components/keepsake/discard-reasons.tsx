"use client";

import { useState } from "react";

import { button, chip, fieldLarge, panel, quiet } from "./styles";

export const DISCARD_REASONS: readonly string[] = [
  "Too expensive",
  "Too far",
  "Not my taste",
  "Already been",
  "Too touristy",
  "Too busy or loud",
  "Wrong time of day",
  "Something else",
];

export function DiscardReasons({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reasons: string[]) => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState("");

  return (
    <div data-qa="discard-reasons" className={`p-5 ${panel}`}>
      <p className="italic">
        What was wrong with these? Tell me if you like, and I will do better.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {DISCARD_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={chosen.includes(reason)}
            onClick={() =>
              setChosen((list) =>
                list.includes(reason)
                  ? list.filter((r) => r !== reason)
                  : [...list, reason],
              )
            }
            className={chip}
          >
            {reason}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm">
        Or in your own words (optional)
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${fieldLarge} mt-1 block w-full`}
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={button}
          onClick={() =>
            onConfirm(note.trim() ? [...chosen, note.trim()] : chosen)
          }
        >
          Show new places
        </button>
        <button type="button" className={quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

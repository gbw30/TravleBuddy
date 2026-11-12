"use client";

import { useState } from "react";

import { field, pill } from "./styles";

/**
 * Choose a slot, then confirm. A native select keeps this usable by keyboard
 * and on a phone; the separate button means arrowing through the list never
 * moves anything by itself.
 */
export function MoveMenu({
  label,
  placeholder,
  action,
  actionLabel,
  options,
  onChoose,
}: {
  label: string;
  placeholder: string;
  /** Visible text of the confirm button, such as "Move". */
  action: string;
  /** What the confirm button does, for screen readers. */
  actionLabel: string;
  options: { value: string; label: string }[];
  onChoose: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={`${field} max-w-28`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={pill}
        aria-label={actionLabel}
        disabled={!value}
        onClick={() => {
          onChoose(value);
          setValue("");
        }}
      >
        {action}
      </button>
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import {
  cityLabel,
  type City,
  type FoundAddress,
} from "@/features/places/contracts";
import type { Located } from "@/features/trips/contracts";
import { callApi } from "@/lib/trip-api";

import { buttonSecond, field, quiet } from "./styles";

const label = "block font-sans text-[13px] text-muted";
const control = `${field} mt-1 block w-full`;

/**
 * Where a stay is, found by address and confirmed by the traveller. It looks
 * up when asked, never while typing (ADR-009), and nothing is kept until the
 * traveller confirms one found address: a position is never guessed.
 */
export function StayAddress({
  cities,
  value,
  onChange,
}: {
  /** The trip's cities that have a position, which an address is looked up near. */
  cities: City[];
  value: Located | null;
  onChange: (located: Located | null) => void;
}) {
  const [text, setText] = useState("");
  const [cityIndex, setCityIndex] = useState(0);
  const [found, setFound] = useState<FoundAddress[]>([]);
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const confirmed = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [moved, setMoved] = useState<"confirmed" | "removed" | null>(null);

  // The button that was pressed is gone once it has worked: keep the focus
  // on the confirmed address, or on the address field once it is removed.
  useEffect(() => {
    if (moved === "confirmed" && value) confirmed.current?.focus();
    if (moved === "removed" && !value) input.current?.focus();
  }, [moved, value]);

  const city = cities[cityIndex] ?? cities[0];

  async function search() {
    const query = text.trim();
    if (searching || !city) return;
    if (query.length < 3) {
      setStatus("Type the street and number, or the name of the place.");
      return;
    }
    setSearching(true);
    setFound([]);
    setStatus("Looking up the address…");
    const result = await callApi<{ addresses: FoundAddress[] }>(
      `/api/v1/places/addresses?q=${encodeURIComponent(query)}&near=${city.latitude},${city.longitude}`,
      { method: "GET" },
    );
    setSearching(false);
    if (!result.ok) {
      setStatus(
        result.error === "lookup_capped"
          ? "Today’s address lookups are used up. Add the stay now and look up its address tomorrow."
          : "Address lookup is not available right now. You can add the stay without an address and look it up later.",
      );
      return;
    }
    setFound(result.data.addresses);
    setStatus(
      result.data.addresses.length === 0
        ? `Nothing found for “${query}”. Try the street and number, or leave the address out.`
        : `${result.data.addresses.length} found. Confirm the right one.`,
    );
  }

  if (value) {
    return (
      <div>
        <p
          ref={confirmed}
          tabIndex={-1}
          className="font-sans text-[13px] break-words text-ink focus-visible:outline-none"
        >
          Address confirmed: {value.address}
        </p>
        <button
          type="button"
          className={quiet}
          onClick={() => {
            setMoved("removed");
            onChange(null);
          }}
        >
          Remove address
        </button>
      </div>
    );
  }

  if (!city) {
    return (
      <p className="font-sans text-[13px] text-muted">
        Add a city to the trip to look up this stay’s address.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        {cities.length > 1 && (
          <label className={`${label} min-w-0 basis-full`}>
            City of the stay
            <select
              value={cityIndex}
              onChange={(event) => setCityIndex(Number(event.target.value))}
              className={control}
            >
              {cities.map((option, index) => (
                <option key={cityLabel(option)} value={index}>
                  {cityLabel(option)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`${label} min-w-0 flex-1`}>
          Address · optional
          <input
            ref={input}
            value={text}
            maxLength={120}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Enter looks up; it must not add the stay around it.
              event.preventDefault();
              search();
            }}
            className={control}
          />
        </label>
        <button
          type="button"
          disabled={searching}
          onClick={search}
          className={buttonSecond}
        >
          Look up address
        </button>
      </div>
      <p role="status" className="mt-1.5 font-sans text-[13px] text-muted">
        {status}
      </p>
      {found.length > 0 && (
        <ul className="mt-1 space-y-2">
          {found.map((address) => (
            <li key={address.ref} className="font-sans text-[13px]">
              <span className="block break-words">{address.label}</span>
              <button
                type="button"
                className={quiet}
                onClick={() => {
                  setMoved("confirmed");
                  setFound([]);
                  setStatus("");
                  onChange({
                    latitude: address.latitude,
                    longitude: address.longitude,
                    ref: address.ref,
                    address: address.label,
                  });
                }}
              >
                Confirm this address
                <span className="sr-only">: {address.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

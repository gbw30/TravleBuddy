"use client";

import { useState } from "react";

import { cityLabel, type City } from "@/features/places/contracts";
import { callApi } from "@/lib/trip-api";

import { buttonSecond, field } from "./styles";

/**
 * Finds a city by name. It searches when asked, never while typing: the
 * lookup service does not allow search-as-you-type (ADR-009).
 */
export function CityPicker({ onPick }: { onPick: (city: City) => void }) {
  const [text, setText] = useState("");
  const [found, setFound] = useState<City[] | null>(null);
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);

  async function search() {
    const query = text.trim();
    if (query.length < 2 || searching) return;
    setSearching(true);
    setStatus("Searching…");
    const result = await callApi<{ cities: City[] }>(
      `/api/v1/places/cities?q=${encodeURIComponent(query)}`,
      { method: "GET" },
    );
    setSearching(false);
    if (!result.ok) {
      setFound(null);
      setStatus(result.message);
      return;
    }
    setFound(result.data.cities);
    setStatus(
      result.data.cities.length === 0
        ? `I could not find a city called “${query}”. Check the spelling, or try a nearby larger city.`
        : `${result.data.cities.length} found. Choose one.`,
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 font-sans text-[13px] text-muted">
          Add a city
          <input
            value={text}
            maxLength={80}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Enter searches; it must not submit the facts around it.
              event.preventDefault();
              search();
            }}
            className={`${field} mt-1 block w-full`}
          />
        </label>
        <button
          type="button"
          disabled={searching}
          onClick={search}
          className={buttonSecond}
        >
          Find city
        </button>
      </div>
      <p role="status" className="mt-1.5 font-sans text-[13px] text-muted">
        {status}
      </p>
      {found && found.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {found.map((city) => (
            <li key={cityLabel(city)}>
              <button
                type="button"
                className={buttonSecond}
                onClick={() => {
                  onPick(city);
                  setText("");
                  setFound(null);
                  setStatus(`${city.name} added.`);
                }}
              >
                {cityLabel(city)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 font-sans text-[11px] text-muted">
        City search © OpenStreetMap contributors
      </p>
    </div>
  );
}

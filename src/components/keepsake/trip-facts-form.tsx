"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import type { TripFacts } from "@/features/trips/contracts";
import { changeTrip } from "@/lib/trip-api";

import {
  BudgetFields,
  FirmnessChoice,
  PurposeField,
  WhenFields,
  WhereFields,
  WhoFields,
} from "./facts-fields";
import { button, eyebrow } from "./styles";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-ink/12 py-6 md:grid-cols-[150px_minmax(0,1fr)] md:gap-8">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className={`${eyebrow} pt-1`}>
        {title}
      </p>
      <div className="min-w-0">{children}</div>
    </fieldset>
  );
}

/**
 * The facts of a trip (PRD 7.2): where, when, who, the budget, how firm the
 * dates and budget are, and the purpose. Saved together.
 */
export function TripFactsForm({
  tripId,
  revision,
  initial,
  readOnly,
}: {
  tripId: string;
  revision: number;
  initial: TripFacts;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [facts, setFacts] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const set = (change: Partial<TripFacts>) => {
    setFacts((current) => ({ ...current, ...change }));
    setStatus(null);
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await changeTrip(tripId, revision, "PATCH", {
      action: "facts",
      facts,
    });
    setSaving(false);
    setStatus(
      result.ok
        ? { ok: true, text: "Saved." }
        : { ok: false, text: result.message },
    );
    router.refresh();
  }

  return (
    <form onSubmit={save} aria-labelledby="facts-heading">
      <fieldset disabled={readOnly || saving} className="min-w-0">
        <Section title="Where">
          <WhereFields facts={facts} set={set} />
        </Section>

        <Section title="When">
          <WhenFields facts={facts} set={set} />
          <FirmnessChoice
            name="dates-firmness"
            value={facts.datesFirmness}
            words={{
              FIXED: "The dates are fixed",
              FLEXIBLE: "The dates can move",
            }}
            onChange={(datesFirmness) => set({ datesFirmness })}
          />
        </Section>

        <Section title="Who">
          <WhoFields facts={facts} set={set} />
        </Section>

        <Section title="Budget">
          <BudgetFields facts={facts} set={set} />
          <FirmnessChoice
            name="budget-firmness"
            value={facts.budgetFirmness}
            words={{
              FIXED: "The budget is fixed",
              FLEXIBLE: "The budget can stretch",
            }}
            onChange={(budgetFirmness) => set({ budgetFirmness })}
          />
        </Section>

        <Section title="Purpose">
          <PurposeField facts={facts} set={set} />
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-4 border-t border-ink/12 pt-6">
          <button type="submit" disabled={saving} className={button}>
            {saving ? "Saving…" : "Save the facts"}
          </button>
          <p
            role="status"
            className={`font-sans text-[14px] ${status?.ok === false ? "text-stamp" : "text-muted"}`}
          >
            {status?.text}
          </p>
        </div>
      )}
    </form>
  );
}

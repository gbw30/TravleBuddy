"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { changeTrip } from "@/lib/trip-api";

import { buttonSecond } from "./styles";

/** Marks the plan finished, or reopens it (TB-HOM-05). */
export function PlanStateButton({
  tripId,
  revision,
  finished,
}: {
  tripId: string;
  revision: number;
  finished: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    const result = await changeTrip(tripId, revision, "PATCH", {
      action: finished ? "reopen" : "finish",
    });
    setBusy(false);
    setProblem(result.ok ? null : result.message);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={buttonSecond}
      >
        {finished ? "Reopen the plan" : "Mark the plan as finished"}
      </button>
      <p role="status" className="font-sans text-[13px] text-stamp">
        {problem}
      </p>
    </>
  );
}

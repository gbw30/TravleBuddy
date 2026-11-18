import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BriefSteps } from "@/components/keepsake/brief-steps";
import { eyebrow, pageTitle, quiet } from "@/components/keepsake/styles";
import { requireUser } from "@/lib/authorization";
import { openingStep } from "@/use-cases/brief-view";
import { loadBrief } from "@/use-cases/save-brief";

/** The trip brief of Quick plan (PRD 11.1). `?step=3` opens it at a step. */
export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const userId = await requireUser();
  const { tripId } = await params;
  const { step } = await searchParams;
  const brief = await loadBrief(userId, tripId);
  if (!brief) notFound();
  // An archived trip refuses changes; its page says how to restore it.
  if (brief.archived) redirect(`/trips/${tripId}`);

  return (
    <main className="mx-auto max-w-2xl py-10 md:py-14">
      <p className={`${eyebrow} [overflow-wrap:anywhere]`}>
        Quick plan · {brief.title}
      </p>
      <h1 className={`mt-4 ${pageTitle}`}>
        The trip <em>brief</em>
      </h1>
      <p className="mt-5 text-lg text-ink/80">
        Only the first step is needed. I fill the rest from what I remember, and
        tell you what I assumed.
      </p>
      <p className="mt-3">
        <Link href={`/trips/${tripId}`} className={quiet}>
          Back to the trip
        </Link>
      </p>
      <div className="mt-10">
        <BriefSteps
          key={tripId}
          initial={brief}
          startAt={openingStep(
            brief,
            typeof step === "string" ? step : undefined,
          )}
        />
      </div>
    </main>
  );
}

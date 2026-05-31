import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { getPlanningWorkspace } from "@/features/recommendations/service";
import { planningTopicSchema } from "@/features/recommendations/schemas";
import type { PlanningTopic } from "@/features/recommendations/types";
import { PlanningWorkspace } from "@/components/recommendations/planning-workspace";

type PlanningPageProps = {
  params: Promise<{
    tripId: string;
  }>;
  searchParams?: Promise<{
    topic?: string;
    message?: string;
    error?: string;
  }>;
};

function activeTopic(value: string | undefined): PlanningTopic {
  const parsed = planningTopicSchema.safeParse(value);

  return parsed.success ? parsed.data : "HOTEL_BASE";
}

export default async function PlanningPage({
  params,
  searchParams,
}: PlanningPageProps) {
  const userId = await requireUser();
  const { tripId } = await params;
  const query = await searchParams;
  const result = await getPlanningWorkspace(userId, tripId);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status !== "ok") {
    return (
      <main className="flex-1 bg-zinc-50">
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Planning loop</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Planning loop is locked
            </h1>
            {result.status === "archived" ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Archived trips cannot use the planning loop.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Complete the trip details before starting conversational
                  planning.
                </p>
                <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
                  {result.missingRequirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </>
            )}
            <Link
              href={`/trips/${tripId}/settings`}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Complete trip details
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <PlanningWorkspace
      trip={result.trip}
      preference={result.preference}
      selectedPlaces={result.selectedPlaces}
      recommendations={result.recommendations}
      activeTopic={activeTopic(query?.topic)}
      message={query?.message}
      error={query?.error}
    />
  );
}

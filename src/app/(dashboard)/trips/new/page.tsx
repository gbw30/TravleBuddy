import Link from "next/link";
import { createTripFormAction } from "@/features/trips/actions";
import { requireUser } from "@/lib/authorization";
import { NewTripForm } from "@/components/trips/new-trip-form";

type NewTripPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function NewTripPage({ searchParams }: NewTripPageProps) {
  await requireUser();
  const params = await searchParams;
  const hasError = params?.error === "invalid";

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm font-medium text-zinc-500">New trip</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
            Create a trip
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Save an early idea as a draft, or complete the required details to
            continue into the planning workflow.
          </p>
        </div>

        {hasError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Check the trip details. Drafts require a title, and completed fields
            must use supported locations and valid dates.
          </div>
        ) : null}

        <NewTripForm action={createTripFormAction} />
        <Link
          href="/trips"
          className="mt-4 inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
        >
          Cancel
        </Link>
      </section>
    </main>
  );
}

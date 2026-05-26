import { requireUser } from "@/lib/authorization";

export default async function TripsPage() {
  await requireUser();

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm font-medium text-zinc-500">Trips</p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Trip workspace</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          This protected route is ready for Phase 4 trip creation, discovery,
          and planning workflows.
        </p>
      </section>
    </main>
  );
}

import { requireUser } from "@/lib/authorization";
import { auth } from "@/lib/auth";

export default async function ProfilePage() {
  await requireUser();
  const session = await auth();
  const user = session?.user;

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Profile</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            Signed-in account
          </h1>
          <dl className="mt-6 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-zinc-500">User ID</dt>
              <dd className="mt-1 break-all text-zinc-950">{user?.id}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Name</dt>
              <dd className="mt-1 text-zinc-950">{user?.name ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Email</dt>
              <dd className="mt-1 text-zinc-950">{user?.email ?? "Not provided"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}

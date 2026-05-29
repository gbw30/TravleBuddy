import { requireUser } from "@/lib/authorization";
import { updateUserProfileFormAction } from "@/features/profile/actions";
import {
  getProfileForUser,
  getUserTravelPreferenceForUser,
} from "@/features/profile/queries";

type ProfilePageProps = {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
  }>;
};

function listValue(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "Not set";
}

function optionalValue(value: string | number | null) {
  return value === null || value === "" ? "Not set" : value;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const userId = await requireUser();
  const query = await searchParams;
  const [profile, travelPreference] = await Promise.all([
    getProfileForUser(userId),
    getUserTravelPreferenceForUser(userId),
  ]);

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        {query?.saved === "1" ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Profile saved.
          </div>
        ) : null}
        {query?.error === "invalid" ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Enter a profile name before saving.
          </div>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form
            action={updateUserProfileFormAction}
            className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-zinc-500">Profile</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Account details
            </h1>
            <div className="mt-6 grid gap-4 text-sm">
              <label className="font-medium text-zinc-800">
                Name
                <input
                  required
                  name="name"
                  defaultValue={profile?.name ?? ""}
                  className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-500"
                />
              </label>
              <div>
                <p className="font-medium text-zinc-500">Email</p>
                <p className="mt-1 text-zinc-950">
                  {profile?.email ?? "Not provided"}
                </p>
              </div>
            </div>
            <button
              type="submit"
              className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Save profile
            </button>
          </form>

          <aside className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">
              Saved travel preferences
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-950">
              New-trip defaults
            </h2>
            {travelPreference ? (
              <dl className="mt-5 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Pace</dt>
                  <dd className="font-medium text-zinc-950">
                    {optionalValue(travelPreference.pace)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Budget</dt>
                  <dd className="font-medium text-zinc-950">
                    {optionalValue(travelPreference.budgetLevel)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Interests</dt>
                  <dd className="mt-1 text-zinc-950">
                    {listValue(travelPreference.interests)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Custom preferences</dt>
                  <dd className="mt-1 text-zinc-950">
                    {listValue(travelPreference.customPreferences)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-5 text-sm leading-6 text-zinc-600">
                Save trip preferences once to create reusable defaults for new
                trips.
              </p>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

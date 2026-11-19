import { ProfileBook } from "@/components/keepsake/profile-book";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/authorization";
import { getRates } from "@/lib/currency";
import { loadProfile } from "@/use-cases/profile";

/** The personal profile: everything the site believes about the traveller (PRD 12.5). */
export default async function ProfilePage() {
  const userId = await requireUser();
  // The rates are for the daily budget; without them it stays in yen.
  const [profile, session, rates] = await Promise.all([
    loadProfile(userId),
    auth(),
    getRates(),
  ]);
  return (
    <main>
      <ProfileBook
        initial={profile}
        name={session?.user?.name ?? null}
        rates={rates}
      />
    </main>
  );
}

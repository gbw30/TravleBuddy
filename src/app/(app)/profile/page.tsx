import { ProfileBook } from "@/components/keepsake/profile-book";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/authorization";
import { loadProfile } from "@/use-cases/profile";

/** The personal profile: everything the site believes about the traveller (PRD 12.5). */
export default async function ProfilePage() {
  const userId = await requireUser();
  const [profile, session] = await Promise.all([loadProfile(userId), auth()]);
  return (
    <main>
      <ProfileBook initial={profile} name={session?.user?.name ?? null} />
    </main>
  );
}

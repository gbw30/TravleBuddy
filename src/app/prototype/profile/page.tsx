import { ProfileList } from "@/components/keepsake/profile-list";
import { getRates } from "@/features/prototype/currency";
import { profileEntries } from "@/features/prototype/sample-home";

export default async function PrototypeProfile() {
  return <ProfileList initial={profileEntries} rates={await getRates()} />;
}

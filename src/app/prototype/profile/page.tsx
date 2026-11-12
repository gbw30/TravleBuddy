import { ProfileList } from "@/components/keepsake/profile-list";
import { profileEntries } from "@/features/prototype/sample-home";

export default function PrototypeProfile() {
  return <ProfileList initial={profileEntries} />;
}

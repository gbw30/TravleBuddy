import { StartTrip } from "@/components/keepsake/start-trip";
import { requireUser } from "@/lib/authorization";

export default async function NewTripPage() {
  await requireUser();
  return (
    <main>
      <StartTrip />
    </main>
  );
}

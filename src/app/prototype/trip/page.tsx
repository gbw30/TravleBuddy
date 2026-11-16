import {
  PrototypeWorkspace,
  type WorkspaceOptions,
} from "@/components/keepsake/prototype-workspace";
import { sampleTrip } from "@/features/prototype/sample-trip";

export default async function PrototypeTrip({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // Design-review switches; see docs/design/prototype-review.md.
  const options: WorkspaceOptions = {
    photos: params.photos !== "off",
    closerLook: params.look === "overlay" ? "overlay" : "enlarged",
    phoneItinerary: params.phone === "tab" ? "tab" : "sheet",
    built: params.built === "1",
  };

  return <PrototypeWorkspace trip={sampleTrip} options={options} />;
}

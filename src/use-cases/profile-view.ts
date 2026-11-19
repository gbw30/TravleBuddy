// The shape of a profile answer. Types only, so the browser may import it.
import type {
  ProfileEntry,
  ProfileNote,
  ProfileTopicInfo,
} from "@/features/memory/contracts";

/** One entry as the profile page shows it. */
export type ShownEntry = ProfileEntry & {
  id: string;
  /** The value in the words the traveller reads. */
  label: string;
};

/** Everything the profile page needs (TB-MEM-11). */
export type ProfileView = {
  revision: number;
  entries: ShownEntry[];
  /** Kept and shown; not yet affecting suggestions (TB-MEM-14). */
  notes: (ProfileNote & { id: string })[];
  topics: ProfileTopicInfo[];
};

/** Where something the traveller said was filed. */
export type FiledAs =
  | { type: "entry"; entry: ShownEntry }
  | { type: "note"; note: ProfileNote & { id: string } };

/**
 * What the profile did to one trip: each memory the trip went by, with an
 * effect its plan shows. Nothing here is claimed that the plan cannot prove.
 */
export type ShapedView = {
  tripId: string;
  /** A name to recognise the trip by. */
  title: string;
  pairs: { memory: string; effect: string }[];
};

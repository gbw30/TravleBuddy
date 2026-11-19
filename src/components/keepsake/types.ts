import type { PlaceLinks } from "@/features/places/contracts";

/** What a postcard needs to know about a place. Null means unknown, never a guess. */
export type CardPlace = {
  id: string;
  name: string;
  essentials: string;
  summary: string;
  reason: string;
  address: string;
  hours: string | null;
  priceLevel: 1 | 2 | 3 | 4 | null;
  rating: number | null;
  photo: string | null;
  photoCredit: string | null;
  /** Null for a sample place. */
  links: PlaceLinks | null;
  hoursDoubt: string | null;
};

/** "Temple · 25 min by train" gives "Temple". */
export function placeKind(place: Pick<CardPlace, "essentials">): string {
  return place.essentials.split(" · ")[0];
}

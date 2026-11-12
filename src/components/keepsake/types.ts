export type ArtStyle = "sunset" | "sea" | "brick";

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
  art: ArtStyle;
};

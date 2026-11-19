// The Recommendations service interface: which places are offered for a
// slot, why, and the record of what the traveller did with each card.
// Browser code imports ./contracts instead.
export {
  readDiscards,
  recordCard,
  recordDiscards,
  recordPresented,
} from "./card-store";
export {
  INTEREST_KINDS,
  noHistory,
  noTaste,
  proposeCards,
  toCard,
  type CardHistory,
  type CardTaste,
  type ProposeInput,
} from "./propose";

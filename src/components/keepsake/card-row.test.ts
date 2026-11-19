import { describe, expect, it } from "vitest";

import { cardIndex } from "./card-row";

describe("cardIndex", () => {
  it("names the card nearest the start of the row", () => {
    expect(cardIndex(0, 300, 3)).toBe(0);
    expect(cardIndex(160, 300, 3)).toBe(1);
    expect(cardIndex(900, 300, 3)).toBe(2);
    expect(cardIndex(10, 0, 3)).toBe(0);
  });
});

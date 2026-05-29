import { describe, expect, it } from "vitest";
import { updateProfileInputSchema } from "./schemas";

describe("profile schemas", () => {
  it("trims editable profile names", () => {
    expect(updateProfileInputSchema.parse({ name: "  Gabriel  " })).toEqual({
      name: "Gabriel",
    });
  });

  it("rejects blank profile names", () => {
    expect(() => updateProfileInputSchema.parse({ name: "   " })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { shouldSubmitSignOut } from "./sign-out-confirm-form";

describe("sign out confirmation", () => {
  it("submits only when the user confirms sign out", () => {
    expect(shouldSubmitSignOut(true)).toBe(true);
    expect(shouldSubmitSignOut(false)).toBe(false);
  });
});

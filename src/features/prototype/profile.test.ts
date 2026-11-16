import { describe, expect, it } from "vitest";

import { confirm, guessTopic, habitText, moveHabit, sureness } from "./profile";
import { profileEntries, type ProfileEntry } from "./sample-home";

const start = profileEntries.find((e) => e.topic === "day shape")!;

describe("profile", () => {
  it("turns sureness into dots and a plain word", () => {
    expect(sureness({ sureness: "I think" })).toEqual({
      dots: 1,
      label: "Still a guess",
    });
    expect(sureness({ sureness: "always" }).dots).toBe(3);
  });

  it("reads a habit on a scale as a sentence", () => {
    const pace = profileEntries.find((e) => e.topic === "pace")!;
    expect(habitText(pace.scale!)).toBe("A relaxed pace");
    expect(habitText(start.scale!)).toBe("Days start around 10:00");
    // A currency code keeps its capitals.
    expect(
      habitText({ stops: ["SGD 120"], index: 0, say: "About {stop} a day" }),
    ).toBe("About SGD 120 a day");
  });

  it("confirming a guess makes it certain and credits the traveller", () => {
    expect(start.sureness).toBe("I think");
    expect(confirm(start)).toMatchObject({
      sureness: "always",
      source: "you told me",
    });
  });

  it("moving a habit changes its text and makes it certain", () => {
    const moved = moveHabit(start, 1);
    expect(moved.value).toBe("Days start around 8:00");
    expect(moved.scale!.index).toBe(1);
    expect(moved.sureness).toBe("always");
    // The sample data itself is untouched.
    expect(start.scale!.index).toBe(3);
  });

  it("ignores a stop that does not exist, and entries without a scale", () => {
    expect(moveHabit(start, 9)).toBe(start);
    const plain: ProfileEntry = { ...start, scale: undefined };
    expect(moveHabit(plain, 1)).toBe(plain);
  });

  it("files a sentence under the topic it is about", () => {
    expect(guessTopic("I get tired of museums after two hours")).toBe("pace");
    expect(guessTopic("I can't do stairs")).toBe("getting around");
    expect(guessTopic("No spicy food please")).toBe("food");
    expect(guessTopic("I love bookshops")).toBe("interests");
  });
});

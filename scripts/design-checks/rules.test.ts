import { describe, expect, it } from "vitest";

import { isMovement, onlyColourDiffers, type Look } from "./rules";

describe("what counts as movement", () => {
  it("is a change of place, size or turn, in either spelling", () => {
    for (const name of [
      "transform",
      "translate",
      "scale",
      "rotate",
      "top",
      "margin-top",
      "marginTop",
      "inset-inline-start",
      "width",
    ]) {
      expect(isMovement([name]), name).toBe(true);
    }
    expect(isMovement(["opacity", "offset", "translate"])).toBe(true);
  });

  it("is not a fade, a colour or a shadow", () => {
    expect(
      isMovement([
        "opacity",
        "color",
        "background-color",
        "box-shadow",
        "offset",
        "easing",
        "composite",
        "computedOffset",
        "max-height",
      ]),
    ).toBe(false);
    expect(isMovement([])).toBe(false);
  });
});

describe("a choice shown by colour alone", () => {
  const look = (over: Partial<Look> = {}): Look => ({
    weight: "400",
    decoration: "none",
    border: "1px solid / 1px solid",
    outline: "none 0px",
    shadow: "none",
    marks: 0,
    ground: "#f4eee3",
    ink: "#1d1a16",
    ...over,
  });

  it("is one that differs only in hue: red text against green text of the same lightness", () => {
    expect(
      onlyColourDiffers(look({ ink: "#b3261e" }), look({ ink: "#1e6b2b" })),
    ).toBe(true);
    expect(onlyColourDiffers(look(), look())).toBe(true);
  });

  it("is not one with a mark, a heavier weight, an underline, a visible border or a ring", () => {
    for (const over of [
      { marks: 1 },
      { weight: "600" },
      { decoration: "underline" },
      { border: "none / 1.5px solid" },
      { shadow: "0px 0px 0px 2px c" },
      { outline: "solid 2px" },
    ] as Partial<Look>[]) {
      expect(onlyColourDiffers(look(over), look()), JSON.stringify(over)).toBe(
        false,
      );
    }
  });

  it("is not one that is filled dark where the others are light", () => {
    // Ink on paper is far past 3:1, so the fill shows without telling hues apart.
    expect(
      onlyColourDiffers(look({ ground: "#1d1a16", ink: "#f4eee3" }), look()),
    ).toBe(false);
    // A faint tint does not.
    expect(onlyColourDiffers(look({ ground: "#ece5d8" }), look())).toBe(true);
    // A colour that could not be read is no evidence either way.
    expect(onlyColourDiffers(look({ ground: "" }), look())).toBe(true);
  });
});

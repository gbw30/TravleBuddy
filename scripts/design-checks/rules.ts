import { contrastRatio } from "@/lib/contrast";

// The two judgements of the design walk that need no browser.

/** Properties whose change moves or resizes something on the screen. A fade does neither. */
const MOVING = [
  "transform",
  "translate",
  "scale",
  "rotate",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "width",
  "height",
  "margin",
];

/** Whether an animation or transition of these properties is movement (TB-DSN-03). */
export const isMovement = (properties: string[]) =>
  properties.some((name) => {
    const plain = name.toLowerCase().replace(/-/g, "");
    return MOVING.some((moving) => plain.startsWith(moving));
  });

/** How a control looks. */
export type Look = {
  weight: string;
  decoration: string;
  /** Borders a person can see: a transparent one is none. */
  border: string;
  outline: string;
  /** The shadow's shape: its colours are replaced before it is compared. */
  shadow: string;
  /** Icons and marks drawn in or around it. */
  marks: number;
  /** The colour behind it and the colour of its text, as "#rrggbb". */
  ground: string;
  ink: string;
};

const SHAPE = [
  "weight",
  "decoration",
  "border",
  "outline",
  "shadow",
  "marks",
] as const;
const lighterOrDarker = (a: string, b: string) =>
  [a, b].every((colour) => /^#[0-9a-f]{6}$/i.test(colour)) &&
  contrastRatio(a, b) >= 3;

/**
 * Whether a chosen control differs from one that is not chosen by colour
 * alone (TB-DSN-06). Two colours that differ in lightness by 3:1 or more
 * are more than colour: WCAG 1.4.1 counts that as a second sign, since it
 * shows without telling hues apart.
 */
export const onlyColourDiffers = (chosen: Look, other: Look) =>
  SHAPE.every((key) => chosen[key] === other[key]) &&
  !lighterOrDarker(chosen.ground, other.ground) &&
  !lighterOrDarker(chosen.ink, other.ink);

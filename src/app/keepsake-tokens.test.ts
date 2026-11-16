import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`missing token ${name}`);
  return match[1];
};

// [text colour, background colour]
const textPairs = [
  ["ink", "paper"],
  ["ink", "row"],
  ["ink", "card"],
  ["ink", "stamp-paper"],
  ["terracotta", "card"],
  ["terracotta", "stamp-paper"],
  ["terracotta-deep", "paper"],
  ["stamp", "paper"],
  ["terracotta", "paper"],
  ["muted", "paper"],
  ["muted", "card"],
  ["paper", "ink"],
] as const;

describe("keepsake tokens", () => {
  it.each(textPairs)("%s on %s meets WCAG AA", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

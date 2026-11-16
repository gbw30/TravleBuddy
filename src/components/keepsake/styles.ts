// One dark button per decision; everything else is a quiet text link.
const buttonBase =
  "inline-flex items-center justify-center rounded-full bg-ink font-sans font-medium text-paper disabled:opacity-40";
export const button = `${buttonBase} h-9 px-4 text-[13px]`;
export const buttonLarge = `${buttonBase} h-11 px-6 text-[15px]`;

const quietBase =
  "inline-flex items-center font-sans text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4 disabled:opacity-40 disabled:no-underline";
export const quiet = `${quietBase} min-h-8 text-[13px]`;
export const quietLarge = `${quietBase} min-h-11 text-[15px]`;

const fieldBase =
  "rounded-lg border border-ink/30 bg-card font-sans text-ink placeholder:text-muted";
export const field = `${fieldBase} px-2.5 py-1.5 text-[13px]`;
export const fieldLarge = `${fieldBase} px-3.5 py-2.5 text-sm`;

export const eyebrow =
  "font-sans text-[11px] font-medium tracking-[0.14em] text-muted uppercase";

export const pageTitle =
  "text-[40px] leading-[1.04] font-medium tracking-[-0.025em] text-balance md:text-[56px]";
export const sectionTitle =
  "text-[26px] leading-tight font-medium tracking-[-0.02em] md:text-[30px]";
export const cardTitle =
  "text-[21px] leading-tight font-medium tracking-[-0.015em]";

/** A sheet of paper lying on the page. */
export const panel = "rounded-[14px] bg-card shadow-sheet";

/** An answer you can switch on and off. */
export const chip =
  "inline-flex min-h-9 items-center rounded-full px-4 font-sans text-[13px] text-ink shadow-[inset_0_0_0_1px_rgb(29_26_22/0.25)] aria-pressed:bg-ink aria-pressed:text-paper";

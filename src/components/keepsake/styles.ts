// Every control answers the pointer, a press and the keyboard. Speeds and the
// curve come from the sites measured in docs/design/mockups-2026-11.
const settle = "duration-150 ease-settle";

// One dark button per decision; everything else is a quiet text link.
const buttonBase = `group inline-flex items-center justify-center gap-3 rounded-full bg-ink font-sans font-medium text-paper transition-[background-color,box-shadow,scale] ${settle} hover:bg-black hover:shadow-[0_10px_24px_rgb(29_26_22/0.22)] active:scale-[0.96] disabled:opacity-40 disabled:hover:bg-ink disabled:hover:shadow-none disabled:active:scale-100`;
export const button = `${buttonBase} h-9 px-4 text-[13px]`;
export const buttonLarge = `${buttonBase} h-[52px] px-6 text-[15px]`;
/** The arrow inside a main button. It slides when the button is hovered. */
export const buttonArrow =
  "-mr-3.5 grid size-9 place-items-center rounded-full bg-paper text-ink transition-transform duration-300 ease-settle group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0";

/** The second choice next to a main button. Fills with ink on hover. */
export const buttonSecond = `inline-flex h-9 items-center justify-center rounded-full px-4 font-sans text-[13px] font-medium text-ink shadow-[inset_0_0_0_1.5px_rgb(29_26_22/0.25)] transition-[background-color,color,box-shadow,scale] ${settle} hover:bg-ink hover:text-paper hover:shadow-none active:scale-[0.96]`;

const quietBase = `min-w-6 inline-flex items-center font-sans font-medium text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4 transition-colors ${settle} hover:text-terracotta hover:decoration-terracotta disabled:opacity-40 disabled:no-underline disabled:hover:text-ink`;
export const quiet = `${quietBase} min-h-8 text-[13px]`;
export const quietLarge = `${quietBase} min-h-11 text-[15px]`;

const fieldBase = `rounded-[10px] border border-ink/30 bg-white font-sans text-ink transition-[border-color,box-shadow] ${settle} placeholder:text-muted hover:border-ink/60 focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_rgb(164_80_44/0.18)] focus-visible:outline-none`;
export const field = `${fieldBase} px-2.5 py-1.5 text-[13px]`;
export const fieldLarge = `${fieldBase} px-3.5 py-2.5 text-[15px]`;

export const eyebrow =
  "font-mono text-[11px] tracking-[0.14em] text-muted uppercase";

const display = "font-serif font-normal text-balance";
export const pageTitle = `${display} text-[44px] leading-[1.02] tracking-[-0.035em] md:text-[72px]`;
export const sectionTitle = `${display} text-[30px] leading-[1.06] tracking-[-0.03em] md:text-[44px]`;
export const cardTitle = `${display} text-[24px] leading-[1.1] tracking-[-0.02em] md:text-[27px]`;

/** A sheet of paper lying on the page. */
export const panel = "rounded-2xl bg-card shadow-sheet";
/** A card that can be picked: it rises to meet the pointer. */
export const lift =
  "transition-[translate,box-shadow] duration-300 ease-settle hover:-translate-y-1 hover:shadow-lift motion-reduce:transition-[box-shadow] motion-reduce:hover:translate-y-0";

/** An answer you can switch on and off. */
export const chip = `inline-flex min-h-9 items-center rounded-full px-4 font-sans text-[13px] text-ink shadow-[inset_0_0_0_1px_rgb(29_26_22/0.25)] transition-[background-color,color,box-shadow,scale] ${settle} hover:shadow-[inset_0_0_0_1px_rgb(29_26_22/0.7)] active:scale-[0.96] aria-pressed:bg-ink aria-pressed:text-paper`;

/** A phone tab (the plan or the itinerary); filled with ink when selected. */
export const tab =
  "inline-flex min-h-9 items-center rounded-full px-4 font-sans text-[13px] text-ink shadow-[inset_0_0_0_1px_rgb(29_26_22/0.2)] aria-selected:bg-ink aria-selected:text-paper";

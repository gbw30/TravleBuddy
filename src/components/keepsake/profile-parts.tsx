import type { CSSProperties, ReactNode } from "react";

import { eyebrow, sectionTitle } from "./styles";

// The pieces of the profile page's look, shared by the prototype and the
// real profile.

export const card =
  "rounded-2xl bg-card shadow-[0_0_0_1px_rgb(29_26_22/0.12),var(--shadow-sheet)]";
// A guess the traveller has not confirmed gets a terracotta edge.
export const guessCard =
  "rounded-2xl bg-card shadow-[0_0_0_1.5px_rgb(164_80_44/0.5),var(--shadow-sheet)]";
export const rise = (i: number) => ({ "--i": i }) as CSSProperties;

const paths: Record<string, ReactNode> = {
  interests: <path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 20h18" />,
  "getting around": (
    <>
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 11h12M9 21l2-4M15 21l-2-4" />
    </>
  ),
  atmosphere: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  stay: (
    <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M3 18v2M21 18v2M7 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
  ),
  food: <path d="M5 19c0-8 5-13 14-14 0 9-4 14-12 14M5 19c2-4 5-7 9-9" />,
  never: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
};

export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`grid size-11 shrink-0 place-items-center rounded-full bg-tint ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[22px] fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]"
      >
        {paths[name] ?? <circle cx="12" cy="12" r="7" />}
      </svg>
    </span>
  );
}

/** How memory works, in three lines. Shared by the prototype and the real profile. */
export function ProfilePrinciples() {
  return (
    <ol className="mt-14 grid border-y border-ink/12 md:grid-cols-3">
      {[
        [
          "I learn as we plan",
          "When you pick, skip or correct something, I notice the pattern.",
        ],
        [
          "It is only a starting point",
          "What you say about one trip always wins, and does not change this page.",
        ],
        [
          "You are in charge",
          "Correct anything that is wrong, or remove it. I will not argue.",
        ],
      ].map(([title, text], index) => (
        <li
          key={title}
          className="border-ink/12 py-6 max-md:not-first:border-t md:px-7 md:first:pl-0 md:not-first:border-l"
        >
          <span className="font-mono text-[11px] tracking-[0.14em] text-terracotta">
            0{index + 1}
          </span>
          <h2 className="mt-3 text-[24px] leading-[1.1] tracking-[-0.015em]">
            {title}
          </h2>
          <p className="mt-2 text-[15px] text-muted">{text}</p>
        </li>
      ))}
    </ol>
  );
}

export function SectionHead({
  id,
  label,
  note,
  children,
}: {
  id: string;
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
      <div>
        <p className={eyebrow}>{label}</p>
        <h2 id={id} className={`mt-2.5 ${sectionTitle}`}>
          {children}
        </h2>
      </div>
      <p className="max-w-[24rem] text-[15.5px] text-muted md:text-right">
        {note}
      </p>
    </header>
  );
}

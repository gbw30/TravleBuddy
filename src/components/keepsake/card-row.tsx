"use client";

import { useState, type ReactNode } from "react";

/** Which card sits at the start of the row, from how far it has scrolled. */
export function cardIndex(scrollLeft: number, step: number, count: number) {
  if (step <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}

/** The offered cards: a snapping row to swipe on a phone, with "1 of 3" below. */
export function CardRow({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  return (
    <>
      <ul
        onScroll={(event) => {
          const row = event.currentTarget;
          const first = row.children[0] as HTMLElement | undefined;
          const second = row.children[1] as HTMLElement | undefined;
          const step =
            first && second ? second.offsetLeft - first.offsetLeft : 0;
          setIndex(cardIndex(row.scrollLeft, step, count));
        }}
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pt-2 pb-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:items-start sm:gap-0 sm:overflow-visible sm:px-0 sm:pt-6 sm:pb-8"
      >
        {children}
      </ul>
      {count > 1 && (
        <p
          aria-live="polite"
          className="mb-4 text-center font-sans text-[13px] text-muted sm:hidden"
        >
          {index + 1} of {count}
        </p>
      )}
    </>
  );
}

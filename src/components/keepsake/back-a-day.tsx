import { leafOf, weekdayName } from "./format";

function Leaf({ date, old = false }: { date: string; old?: boolean }) {
  const { month, day } = leafOf(date);
  return (
    <span
      aria-hidden
      className={`w-[52px] shrink-0 overflow-hidden rounded-[5px] bg-card text-center shadow-[0_0_0_1px_rgb(29_26_22/0.25),2px_3px_0_var(--color-tint)] ${old ? "-mr-5 rotate-[5deg] opacity-55" : "-rotate-[4deg]"}`}
    >
      <span className="block bg-stamp py-0.5 font-mono text-[9px] tracking-[0.14em] text-white">
        {month}
      </span>
      <span className="block font-serif text-[22px] leading-[1.15]">{day}</span>
    </span>
  );
}

/**
 * A ticket that lands on an earlier date than it left (TB-ITN-26): two
 * calendar leaves, the date left behind and the date landed on, and a line
 * that says which weekday comes twice.
 */
export function BackADay({ left, lands }: { left: string; lands: string }) {
  return (
    <div
      data-qa="back-a-day"
      className="mt-2.5 flex items-center gap-3 rounded-xl border-[1.5px] border-dashed border-terracotta bg-terracotta/5 px-3.5 py-2.5"
    >
      <span className="flex items-center">
        <Leaf date={left} old />
        <Leaf date={lands} />
      </span>
      <p className="font-sans text-[13px] text-ink">
        <b className="block font-serif text-lg leading-tight font-normal text-terracotta-deep">
          You go back a day
        </b>
        You get {weekdayName(lands)} twice. {weekdayName(left)} ends up behind
        you.
      </p>
    </div>
  );
}

/** A ticket that lands on the same date at an earlier clock time: a small clock. */
export function EarlierClock({ lands }: { lands: string }) {
  return (
    <p
      data-qa="earlier-clock"
      className="mt-1.5 flex items-center gap-1.5 pl-[calc(3.1rem+28px)] font-sans text-[12.5px] text-terracotta-deep"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2 1.5" />
      </svg>
      Lands {lands}, earlier on the clock than it left.
    </p>
  );
}

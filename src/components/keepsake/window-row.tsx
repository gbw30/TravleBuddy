import type { TimeShape } from "@/features/trips/contracts";

// The window bar (mockup 4B): solid where a time is set, fading where it
// stays open. Decorative: the row's words say the same.
const bar: Record<TimeShape, { left: string; shape: string; right: string }> = {
  AFTER: {
    left: "",
    shape: "bg-linear-to-r from-terracotta to-transparent opacity-55",
    right: "any time after",
  },
  BEFORE: {
    left: "any time before",
    shape: "bg-linear-to-r from-transparent to-terracotta opacity-55",
    right: "",
  },
  ANY: {
    left: "any time",
    shape: "bg-terracotta opacity-[0.22]",
    right: "today",
  },
  BETWEEN: { left: "", shape: "bg-terracotta opacity-55", right: "" },
};

/** A step with a window of time, not a set time: a solid row with the window drawn under it. */
export function WindowRow({
  time,
  title,
  note,
  window,
}: {
  /** The column's time: the set end of the window, or "any". */
  time: string;
  title: string;
  note?: string | null;
  window: { shape: TimeShape; from: string | null; to: string | null };
}) {
  const look = bar[window.shape];
  return (
    <div
      data-qa="window-row"
      data-shape={window.shape}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card py-3 pr-4 pl-4 text-ink shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
    >
      <span className="min-w-[3.1rem] shrink-0 font-mono text-sm font-medium tabular-nums">
        {time}
      </span>
      <span className="min-w-0 flex-1 font-serif text-[17px] leading-snug [overflow-wrap:anywhere]">
        {title}
      </span>
      {note && (
        <span className="basis-full pl-[calc(3.1rem+12px)] font-sans text-[12.5px] text-muted [overflow-wrap:anywhere]">
          {note}
        </span>
      )}
      <span
        aria-hidden
        className="flex basis-full items-center gap-2 pl-[calc(3.1rem+12px)] font-mono text-[11px] text-muted"
      >
        {window.shape === "AFTER" && window.from}
        {window.shape === "BETWEEN" && window.from}
        {look.left}
        <i className={`h-1.5 flex-1 rounded-[3px] ${look.shape}`} />
        {window.shape === "BEFORE" && window.to}
        {window.shape === "BETWEEN" && window.to}
        {look.right}
      </span>
    </div>
  );
}

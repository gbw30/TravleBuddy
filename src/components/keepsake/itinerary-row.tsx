import type { ReactNode } from "react";

const look = {
  item: "border border-row-edge bg-row",
  wander: "border border-row-edge bg-row italic",
  open: "border-2 border-dashed border-terracotta bg-[rgb(255_250_240/0.5)] text-terracotta-deep",
};

export function ItineraryRow({
  time,
  title,
  variant,
  active = false,
  flag = null,
  children,
}: {
  time: string;
  title: string;
  variant: "item" | "open" | "wander";
  active?: boolean;
  flag?: string | null;
  children?: ReactNode;
}) {
  return (
    <div
      data-qa="itinerary-row"
      data-variant={variant}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm text-ink ${look[variant]}`}
    >
      <span className="w-12 shrink-0 font-bold tabular-nums">{time}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {title}
        {variant === "open" && (active ? ": choosing now" : ": open")}
      </span>
      {children}
      {flag && (
        <p className="basis-full font-sans text-xs font-semibold text-stamp">
          Needs a look: {flag}
        </p>
      )}
    </div>
  );
}

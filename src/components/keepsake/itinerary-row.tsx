import type { ReactNode } from "react";

const look = {
  item: "rounded-lg bg-card shadow-[0_0_0_1px_rgb(29_26_22/0.12)]",
  wander: "",
  open: "rounded-lg border-[1.5px] border-dashed border-ink/25 text-muted",
  active:
    "rounded-lg border-[1.5px] border-dashed border-terracotta bg-terracotta/5 text-terracotta",
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
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-3 pr-4 pl-4 text-ink ${look[variant === "open" && active ? "active" : variant]}`}
    >
      <span className="w-[3.1rem] shrink-0 font-mono text-sm font-medium tabular-nums">
        {time}
      </span>
      <span
        className={`min-w-0 flex-1 font-serif text-[17px] leading-snug [overflow-wrap:anywhere] ${variant === "wander" ? "text-ink/80 italic" : ""}`}
      >
        {variant === "open" && active && (
          <span
            aria-hidden
            className="mr-2.5 inline-block size-[7px] rounded-full bg-terracotta align-middle"
          />
        )}
        {title}
        {variant === "open" && (active ? ": choosing now" : ": open")}
      </span>
      {children}
      {flag && (
        <p className="basis-full font-sans text-xs font-medium text-stamp">
          Needs a look: {flag}
        </p>
      )}
    </div>
  );
}

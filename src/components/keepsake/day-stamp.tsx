export function Stamp({
  label,
  spoken,
  solid = false,
}: {
  label: string;
  spoken: string;
  /** Give the stamp its own paper, for use on top of a photo. */
  solid?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={spoken}
      className={`mx-1.5 inline-block -rotate-[5deg] rounded-[2px] border-[1.5px] border-stamp px-3 py-1.5 font-mono text-[11px] font-medium tracking-[0.16em] whitespace-nowrap text-stamp outline outline-1 outline-offset-2 outline-stamp ${solid ? "bg-card/90" : ""}`}
    >
      {label}
    </span>
  );
}

export function DayStamp({ city, day }: { city: string; day: number }) {
  return (
    <Stamp
      label={`${city.toUpperCase()} · DAY ${day}`}
      spoken={`${city}, day ${day}`}
    />
  );
}

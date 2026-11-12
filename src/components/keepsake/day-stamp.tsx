export function Stamp({ label, spoken }: { label: string; spoken: string }) {
  return (
    <span
      role="img"
      aria-label={spoken}
      className="inline-block rotate-6 border-[3px] border-double border-stamp px-2 py-1 font-mono text-[10px] font-bold text-stamp"
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

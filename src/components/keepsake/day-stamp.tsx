export function DayStamp({ city, day }: { city: string; day: number }) {
  return (
    <span
      role="img"
      aria-label={`${city}, day ${day}`}
      className="inline-block rotate-6 border-[3px] border-double border-stamp px-2 py-1 font-mono text-[10px] font-bold text-stamp"
    >
      {`${city.toUpperCase()} · DAY ${day}`}
    </span>
  );
}

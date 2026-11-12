export function TicketStub({
  time,
  title,
  note,
}: {
  time: string;
  title: string;
  note?: string;
}) {
  return (
    <div
      data-qa="ticket-stub"
      className="flex items-center gap-3 rounded-lg border-l-2 border-dashed border-terracotta bg-card py-2 pr-3 pl-4 text-sm text-ink shadow-[0_2px_6px_rgb(60_40_20/0.2)]"
    >
      <span className="w-12 shrink-0 font-bold tabular-nums">{time}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block">{title}</span>
        {note && <span className="block text-xs opacity-75">{note}</span>}
      </span>
      <span className="font-sans text-[10px] font-bold tracking-widest text-terracotta">
        BOOKED
      </span>
    </div>
  );
}

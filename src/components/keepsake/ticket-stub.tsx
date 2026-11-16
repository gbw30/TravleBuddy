// The half-circle notches take the colour of the surface behind the stub.
// A surface that is not the page sets --notch to its own colour.
const notch =
  "absolute left-[4.4rem] size-3.5 rounded-full bg-(--notch,var(--color-paper)) shadow-[inset_0_0_0_1px_rgb(29_26_22/0.12)]";

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
      className="relative grid grid-cols-[4.85rem_minmax(0,1fr)_auto] items-center rounded-lg bg-card text-ink shadow-[0_0_0_1px_rgb(29_26_22/0.12),0_2px_6px_rgb(29_26_22/0.05)]"
    >
      <span
        aria-hidden
        className={`${notch} -top-2 [clip-path:inset(50%_0_0_0)]`}
      />
      <span
        aria-hidden
        className={`${notch} -bottom-2 [clip-path:inset(0_0_50%_0)]`}
      />
      <span className="py-4 pl-4 font-mono text-sm font-medium tabular-nums">
        {time}
      </span>
      <span className="min-w-0 border-l-[1.5px] border-dashed border-ink/15 px-4 py-3 [overflow-wrap:anywhere]">
        <span className="block font-serif text-[19px] leading-tight">
          {title}
        </span>
        {note && (
          <span className="mt-0.5 block font-sans text-[12.5px] text-muted">
            {note}
          </span>
        )}
      </span>
      <span className="pr-4 font-mono text-[10px] tracking-[0.16em] text-terracotta">
        BOOKED
      </span>
    </div>
  );
}

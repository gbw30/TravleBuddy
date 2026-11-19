import type { CSSProperties, ReactNode } from "react";

/**
 * A black label and one line of note. A pill from sm up; on a phone the label
 * sits above the note, so the label never wraps inside a narrow pill.
 */
export function NoteChip({
  label,
  style,
  children,
}: {
  label: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <p
      className="rise flex flex-col items-start gap-1.5 text-[13px] text-ink/75 sm:inline-flex sm:min-h-8 sm:flex-row sm:items-center sm:gap-2.5 sm:rounded-full sm:bg-card sm:py-1 sm:pr-3.5 sm:pl-1.5 sm:shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
      style={style}
    >
      <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-ink px-2.5 font-mono text-[10.5px] tracking-[0.1em] whitespace-nowrap text-paper uppercase">
        {label}
      </span>
      {children}
    </p>
  );
}

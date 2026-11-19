import Link from "next/link";

import type { BuildReport, ReportLine } from "@/use-cases/plan-snapshot";

import { dayLabel } from "./format";
import { buttonSecond, eyebrow, quiet } from "./styles";

function Lines({
  lines,
  none,
  onChoose,
}: {
  lines: ReportLine[];
  none: string;
  onChoose: (slotId: string) => void;
}) {
  if (lines.length === 0) return <p className="mt-1.5">{none}</p>;
  return (
    <ul className="mt-1.5 space-y-1.5">
      {lines.map(({ line, slotId }) => (
        <li key={line}>
          {line}{" "}
          {slotId && (
            <button
              type="button"
              className={quiet}
              aria-label={`Let me choose. ${line}`}
              onClick={() => onChoose(slotId)}
            >
              Let me choose
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * A Quick plan build on the trip page: its progress while it runs, then the
 * agent's report of what it did (PRD 11.3, 11.4).
 */
export function BuildReportPanel({
  tripId,
  report,
  problem,
  onChoose,
  onContinue,
  onHide,
}: {
  tripId: string;
  report: BuildReport;
  /** Why the build stopped, when it did. */
  problem: string | null;
  onChoose: (slotId: string) => void;
  onContinue: () => void;
  onHide: () => void;
}) {
  const working = report.days.find((day) => !day.built)?.day;
  return (
    <section
      data-qa="build-report"
      data-building={report.building}
      aria-labelledby="report-heading"
      className="mb-12 rounded-[14px] bg-card p-6 shadow-sheet md:p-8"
    >
      <h2
        id="report-heading"
        className="font-serif text-[32px] leading-[1.06] tracking-[-0.03em]"
      >
        {report.building ? (
          <>
            Building your <em>trip</em>
          </>
        ) : (
          <>
            Your trip is <em>built</em>
          </>
        )}
      </h2>

      {report.building ? (
        <>
          <p className="mt-3 text-[16.5px] text-ink/80">
            One day at a time. You can leave and come back; I keep what is
            built.
          </p>
          <ol aria-live="polite" className="mt-5 space-y-2 text-[15px]">
            {report.days.map((day) => (
              <li
                key={day.day}
                className="flex flex-wrap justify-between gap-x-4 rounded-lg px-4 py-2.5 shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
              >
                <span>
                  Day {day.day} · {dayLabel(day.date)}
                </span>
                <span className="font-sans text-[13px] text-muted">
                  {day.built
                    ? "built"
                    : day.day === working && !problem
                      ? "working on it…"
                      : "to come"}
                </span>
              </li>
            ))}
          </ol>
          {problem && (
            <p role="alert" className="mt-4 text-[15px] text-stamp">
              {problem}{" "}
              <button type="button" className={quiet} onClick={onContinue}>
                Continue building
              </button>
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mt-5 grid gap-x-10 gap-y-6 text-[15px] sm:grid-cols-2">
            <div>
              <h3 className={eyebrow}>What I built</h3>
              <p className="mt-1.5">{report.built.join(" ")}</p>
            </div>
            <div>
              <h3 className={eyebrow}>What I assumed</h3>
              {report.assumed.length === 0 ? (
                <p className="mt-1.5">
                  Nothing: you answered everything I went by.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {report.assumed.map(({ line, step }) => (
                    <li key={line}>
                      {line}{" "}
                      <Link
                        href={`/trips/${tripId}/brief?step=${step}`}
                        className={quiet}
                        aria-label={`Change. ${line}`}
                      >
                        Change
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className={eyebrow}>What I could not fit</h3>
              <Lines
                lines={report.unfitted}
                none="Nothing was left over."
                onChoose={onChoose}
              />
            </div>
            <div>
              <h3 className={eyebrow}>Where I was unsure</h3>
              <Lines
                lines={report.unsure}
                none="Nowhere this time."
                onChoose={onChoose}
              />
            </div>
          </div>
          <p className="mt-6">
            <button type="button" className={buttonSecond} onClick={onHide}>
              Hide this report
            </button>
          </p>
        </>
      )}
    </section>
  );
}

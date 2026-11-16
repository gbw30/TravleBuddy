import type { ReactNode } from "react";

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <p
      data-qa="agent-message"
      className="font-serif text-[21px] leading-[1.4] text-pretty italic"
    >
      {children}
    </p>
  );
}

import type { ReactNode } from "react";

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <p
      data-qa="agent-message"
      className="font-serif text-[19px] leading-[1.5] text-pretty italic"
    >
      {children}
    </p>
  );
}

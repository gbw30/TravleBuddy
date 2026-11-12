import type { ReactNode } from "react";

export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <p data-qa="agent-message" className="font-serif leading-relaxed italic">
      {children}
    </p>
  );
}

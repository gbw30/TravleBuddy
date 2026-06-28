"use client";

import { useEffect, useState, type AriaRole, type ReactNode } from "react";

type TimedAlertProps = {
  children: ReactNode;
  className: string;
  durationMs?: number;
  role?: AriaRole;
};

export function TimedAlert({
  children,
  className,
  durationMs = 5000,
  role = "status",
}: TimedAlertProps) {
  const [isMounted, setIsMounted] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setIsVisible(false);
    }, durationMs);
    const removeTimer = window.setTimeout(() => {
      setIsMounted(false);
    }, durationMs + 300);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [durationMs]);

  if (!isMounted) {
    return null;
  }

  return (
    <div
      role={role}
      className={`${className} transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

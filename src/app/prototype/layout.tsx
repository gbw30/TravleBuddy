import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { KeepsakeNav } from "@/components/keepsake/keepsake-nav";

export const metadata: Metadata = {
  title: "TravleBuddy prototype",
  robots: { index: false },
};

export default function PrototypeLayout({ children }: { children: ReactNode }) {
  // The prototype is sample data for design review; it must not ship to production.
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <div className="keepsake-paper min-h-screen flex-1 pb-20 md:pb-0">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 md:px-8">
        <Link href="/prototype" className="text-xl font-bold">
          TravleBuddy
        </Link>
        <span className="rounded-full border border-terracotta-deep px-3 py-0.5 font-sans text-xs font-semibold text-terracotta-deep">
          Prototype · sample data
        </span>
        <div className="md:ml-auto">
          <KeepsakeNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-10 md:px-8">{children}</main>
    </div>
  );
}

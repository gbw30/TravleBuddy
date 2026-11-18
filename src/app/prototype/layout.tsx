import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { KeepsakeNav } from "@/components/keepsake/keepsake-nav";

export const metadata: Metadata = {
  title: "TravleBuddy",
  robots: { index: false },
};

export default function PrototypeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="keepsake-paper min-h-screen flex-1 text-[17px] leading-[1.55]">
      <header className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-5 pt-6 md:px-10 md:pt-7">
        <Link
          href="/prototype"
          className="font-serif text-[24px] tracking-[-0.02em]"
        >
          Travle<em>Buddy</em>
        </Link>
        <div className="ml-auto">
          <KeepsakeNav
            links={[
              { href: "/prototype", label: "Home" },
              { href: "/prototype/new", label: "Create" },
              { href: "/prototype/profile", label: "Profile" },
            ]}
          />
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        {children}
      </main>
    </div>
  );
}

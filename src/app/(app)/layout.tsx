import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/auth-buttons";
import { KeepsakeNav } from "@/components/keepsake/keepsake-nav";

export const metadata: Metadata = { title: "TravleBuddy" };

const links = [
  { href: "/home", label: "Home" },
  { href: "/trips/new", label: "Create" },
  { href: "/profile", label: "Profile" },
];

/** The signed-in shell: the paper page, the three areas and sign out. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="keepsake-paper min-h-screen flex-1 text-[17px] leading-[1.55]">
      <header className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-5 pt-6 md:px-10 md:pt-7">
        <Link
          href="/home"
          className="font-serif text-[24px] tracking-[-0.02em]"
        >
          Travle<em>Buddy</em>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6 md:gap-x-[30px]">
          <KeepsakeNav links={links} />
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-[1240px] px-5 pb-24 md:px-10">
        {children}
      </div>
    </div>
  );
}

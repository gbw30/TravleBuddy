"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/prototype", label: "Home" },
  { href: "/prototype/new", label: "Create" },
  { href: "/prototype/profile", label: "Profile" },
];

/** Top bar on wide screens, fixed bottom bar on phones. */
export function KeepsakeNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-row-edge bg-stamp-paper py-2 font-sans text-sm md:static md:justify-end md:gap-6 md:border-0 md:bg-transparent md:py-0"
    >
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className="rounded-full px-4 py-2 font-semibold text-ink aria-[current=page]:bg-terracotta-deep aria-[current=page]:text-white"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

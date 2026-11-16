"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/prototype", label: "Home" },
  { href: "/prototype/new", label: "Create" },
  { href: "/prototype/profile", label: "Profile" },
];

export function KeepsakeNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex gap-6 font-mono text-xs tracking-[0.12em] uppercase md:gap-[30px]"
    >
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className="inline-flex min-h-8 items-center border-b-[1.5px] border-transparent text-muted transition-colors duration-150 ease-settle hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

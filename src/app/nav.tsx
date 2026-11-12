"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "找店" },
  { href: "/places", label: "店库" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex rounded-full bg-[#efe4d6] p-1 text-sm">
      {LINKS.map((link) => {
        const active = path === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-4 py-1.5 ${active ? "bg-white text-[#1c1612] shadow-sm" : "text-[#7a6c62]"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

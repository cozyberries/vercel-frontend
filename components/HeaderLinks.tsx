"use client";

import Link from "next/link";

interface HeaderLinksProps {
  name: string;
  href: string;
  isActive: boolean;
}

export default function HeaderLinks({
  name,
  href,
  isActive,
}: HeaderLinksProps) {
  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-cb-mauve-tint text-cb-terracotta-deep"
            : "text-cb-fg hover:text-cb-terracotta-deep"
        }`}
      >
        {name}
      </Link>
    </li>
  );
}

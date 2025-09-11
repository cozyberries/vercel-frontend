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
        className={`group relative text-sm font-medium transition-colors ${
          isActive ? "text-primary" : "text-foreground/80 hover:text-primary"
        }`}
      >
        {name}
        <span
          className={`absolute left-0 -bottom-1 h-0.5 w-full origin-left scale-x-0 bg-primary transition-transform duration-200 ${
            isActive ? "scale-x-100" : "group-hover:scale-x-100"
          }`}
        />
      </Link>
    </li>
  );
}

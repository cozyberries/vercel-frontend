// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression (2026-09-13): the hero rendered an empty box until a matchMedia effect decided the
// viewport, so the static home HTML had no h1 and no LCP image. It must server-render the mobile
// variant and swap to the desktop image set only after hydration.

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/app/assets/images", () => ({
  images: {
    heroImages: ["/desktop-1.jpg", "/desktop-2.jpg"],
    mobileHeroImages: ["/mobile-1.jpg", "/mobile-2.jpg"],
  },
}));

import Hero from "./hero";

function matchMediaStub(matches: boolean) {
  return vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", matchMediaStub(true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hero", () => {
  it("server-renders the heading and the mobile hero image (no skeleton)", () => {
    const html = renderToStaticMarkup(<Hero />);
    expect(html).toMatch(/<h1[\s>]/);
    expect(html).toContain('src="/mobile-1.jpg"');
    expect(html).not.toContain("animate-pulse");
  });

  it("keeps the mobile image set on phones after hydration", async () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", "/mobile-1.jpg"));
  });

  it("swaps to the desktop image set once the viewport is known to be wide", async () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    render(<Hero />);
    await waitFor(() => expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", "/desktop-1.jpg"));
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

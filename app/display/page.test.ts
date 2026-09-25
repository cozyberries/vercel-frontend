import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: { version: "page-test" } }));
vi.mock("@/lib/catalog/cache", () => ({
  getSnapshot: async () => ({ snapshot: mocks.snapshot, source: "redis" }),
}));
vi.mock("./DisplayClient", () => ({ default: () => null }));

import DisplayPage, { metadata } from "./page";

describe("/display page", () => {
  it("hands the catalog snapshot to the player", async () => {
    const element = await DisplayPage();
    expect(element.props.snapshot).toBe(mocks.snapshot);
  });

  it("stays out of search engines and installs as its own app", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.manifest).toBe("/display.webmanifest");
  });
});

describe("public/display.webmanifest", () => {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/display.webmanifest"), "utf8"));

  it("opens /display fullscreen under its own name", () => {
    expect(manifest).toMatchObject({
      name: "CozyBerries Display",
      start_url: "/display",
      scope: "/display",
      display: "fullscreen",
    });
  });

  it("points at icons that exist", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(process.cwd(), "public", icon.src))).toBe(true);
    }
  });
});

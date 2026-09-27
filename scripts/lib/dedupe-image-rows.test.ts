import { describe, expect, it } from "vitest";
import { planDedupedRows } from "./dedupe-image-rows.mjs";

const url = (n: number) => `https://x.supabase.co/storage/v1/object/public/media/products/p/${n}.jpg`;
const rows = (...ns: number[]) => ns.map((n, i) => ({ url: url(n), display_order: i + 1 }));
const files = (count: number) => Array.from({ length: count }, (_, i) => [`${i + 1}.jpg`, `${i + 1}_detail.webp`]).flat();

describe("planDedupedRows", () => {
  it("returns null when no file repeats", () => {
    expect(planDedupedRows(rows(1, 2, 3), files(3))).toBeNull();
  });

  it("lists each file once, in file-number order", () => {
    const shuffled = [
      { url: url(4), display_order: 5 },
      { url: url(1), display_order: 1 },
      { url: url(4), display_order: 4 },
      { url: url(3), display_order: 3 },
      { url: url(2), display_order: 2 },
      { url: url(5), display_order: 6 },
    ];
    expect(planDedupedRows(shuffled, files(5))).toEqual({ urls: [url(1), url(2), url(3), url(4), url(5)] });
  });

  // fix-image-gaps renamed 5→4, 7→5, 8→6 and rewrote rows by URL. The rows that pointed at the
  // missing 4.jpg and 6.jpg now duplicate the renamed files one slot early, so first-seen order
  // would put 6.jpg before 5.jpg. File numbers are the display order the renames were aiming for.
  it("puts 5.jpg before 6.jpg in the order the gap fix left behind", () => {
    expect(planDedupedRows(rows(1, 2, 3, 4, 4, 6, 5, 6), files(6))).toEqual({
      urls: [url(1), url(2), url(3), url(4), url(5), url(6)],
    });
  });

  it("skips a product whose rows point at a file missing from storage", () => {
    expect(planDedupedRows(rows(1, 2, 2, 3), files(2))).toEqual({ skip: "rows point at files not in storage: 3.jpg" });
  });

  it("skips a product with a photo in storage that no row shows", () => {
    expect(planDedupedRows(rows(1, 2, 2), files(3))).toEqual({ skip: "storage has photos no row shows: 3.jpg" });
  });
});

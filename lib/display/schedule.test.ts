import { describe, expect, it } from "vitest";
import { FADE_MS, PHOTO_RETRY_MS, SLIDE_MS, msUntilNextReload } from "./schedule";

const HOUR = 60 * 60 * 1000;

describe("msUntilNextReload", () => {
  it("waits until 4 am today when it is earlier", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 3, 0, 0))).toBe(HOUR);
  });

  it("treats exactly 4 am as tomorrow's reload", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 4, 0, 0))).toBe(24 * HOUR);
  });

  it("rolls over to tomorrow in the evening", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 22, 30, 0))).toBe(5.5 * HOUR);
  });

  it("rolls over month ends", () => {
    expect(msUntilNextReload(new Date(2026, 8, 30, 23, 0, 0))).toBe(5 * HOUR);
  });

  it("honours a custom hour", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 1, 0, 0), 2)).toBe(HOUR);
  });
});

describe("timing constants", () => {
  it("shows each slide for 7 s with a 1 s crossfade", () => {
    expect(SLIDE_MS).toBe(7000);
    expect(FADE_MS).toBe(1000);
  });

  it("retries photos that failed to download every five minutes", () => {
    expect(PHOTO_RETRY_MS).toBe(5 * 60 * 1000);
  });
});

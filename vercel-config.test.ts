import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(resolve(__dirname, "vercel.json"), "utf8"));

describe("vercel.json", () => {
  // The project predates Fluid compute (on by default only for projects created after
  // 2025-04-23), so it ran on legacy serverless: one request per instance, no pre-warming,
  // no bytecode cache. /products, which renders per request, took 1-1.5s after an idle spell.
  it("turns on Fluid compute", () => {
    expect(config.fluid).toBe(true);
  });

  it("keeps functions in Mumbai next to Redis", () => {
    expect(config.regions).toEqual(["bom1"]);
  });
});

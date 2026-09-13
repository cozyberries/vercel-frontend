import { afterEach, describe, expect, it } from "vitest";
import { catalogSource, isCatalogRedisEnabled } from "./flags";

const original = process.env.CATALOG_SOURCE;

afterEach(() => {
  if (original === undefined) delete process.env.CATALOG_SOURCE;
  else process.env.CATALOG_SOURCE = original;
});

describe("catalog flags", () => {
  it("defaults to legacy when unset or unknown", () => {
    delete process.env.CATALOG_SOURCE;
    expect(catalogSource()).toBe("legacy");
    process.env.CATALOG_SOURCE = "banana";
    expect(isCatalogRedisEnabled()).toBe(false);
  });

  it("enables redis only for the exact value", () => {
    process.env.CATALOG_SOURCE = "redis";
    expect(isCatalogRedisEnabled()).toBe(true);
    process.env.CATALOG_SOURCE = "Redis";
    expect(isCatalogRedisEnabled()).toBe(false);
  });
});

export type CatalogSourceFlag = "redis" | "legacy";

/** CATALOG_SOURCE=redis switches readers to the Redis catalog. Anything else is legacy. */
export function catalogSource(): CatalogSourceFlag {
  return process.env.CATALOG_SOURCE === "redis" ? "redis" : "legacy";
}

export function isCatalogRedisEnabled(): boolean {
  return catalogSource() === "redis";
}

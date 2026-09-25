import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  it("keeps the stall display out of search engines", () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const disallow = list.flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );
    expect(disallow).toContain("/display");
  });
});

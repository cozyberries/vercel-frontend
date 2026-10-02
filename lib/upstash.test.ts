import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    del = h.del;
  },
}));

import { UpstashService } from "./upstash";

beforeEach(() => {
  h.del.mockReset().mockResolvedValue(5);
});

describe("UpstashService.deleteMany", () => {
  it("deletes every key in one DEL", async () => {
    expect(await UpstashService.deleteMany(["a", "b", "c"])).toBe(true);
    expect(h.del).toHaveBeenCalledTimes(1);
    expect(h.del).toHaveBeenCalledWith("a", "b", "c");
  });

  it("sends nothing for an empty list", async () => {
    expect(await UpstashService.deleteMany([])).toBe(true);
    expect(h.del).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when Redis fails", async () => {
    h.del.mockRejectedValueOnce(new Error("down"));
    expect(await UpstashService.deleteMany(["a"])).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  users: [] as { id: string; email: string; phone: string }[],
  listUsers: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({ auth: { admin: { listUsers: h.listUsers } } }),
}));

import { findUserIdByPhone } from "./auth-phone";

beforeEach(() => {
  h.listUsers.mockReset();
  h.listUsers.mockImplementation(async () => ({ data: { users: h.users }, error: null }));
});

describe("findUserIdByPhone", () => {
  // Staff-created customers are stored with the country code (+91…/91…);
  // the login form sends the bare 10 digits.
  const stored = ["919876543210", "+919876543210", "9876543210"];

  for (const phone of stored) {
    for (const input of ["9876543210", "+91 98765 43210"]) {
      it(`finds a user stored as ${phone} for input "${input}"`, async () => {
        h.users = [
          { id: "other", email: "other@x.y", phone: "919999999999" },
          { id: "user-1", email: "asha@x.y", phone },
        ];
        expect(await findUserIdByPhone(input)).toEqual({ userId: "user-1", email: "asha@x.y" });
      });
    }
  }

  it("returns null for a different number", async () => {
    h.users = [{ id: "user-1", email: "asha@x.y", phone: "919876543210" }];
    expect(await findUserIdByPhone("9123456789")).toBeNull();
  });

  it("returns null without scanning when the input is not a 10-digit number", async () => {
    h.users = [{ id: "user-1", email: "asha@x.y", phone: "" }];
    expect(await findUserIdByPhone("12345")).toBeNull();
    expect(h.listUsers).not.toHaveBeenCalled();
  });
});

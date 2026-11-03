import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: null as unknown,
  fetchProductList: vi.fn(),
  fetchReference: vi.fn(),
  fetchProduct: vi.fn(),
  createProduct: vi.fn(),
  saveProduct: vi.fn(),
  setImageOrder: vi.fn(),
  appendImage: vi.fn(),
  buildPhotoFiles: vi.fn(),
  uploadPhotoFiles: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/admin/products/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/products/db")>()),
  fetchProductList: h.fetchProductList,
  fetchReference: h.fetchReference,
  fetchProduct: h.fetchProduct,
  createProduct: h.createProduct,
  saveProduct: h.saveProduct,
  setImageOrder: h.setImageOrder,
  appendImage: h.appendImage,
}));
vi.mock("@/lib/admin/products/photos", () => ({
  buildPhotoFiles: h.buildPhotoFiles,
  uploadPhotoFiles: h.uploadPhotoFiles,
  photoStem: () => "p-stem",
}));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { ProductError } from "@/lib/admin/products/db";
import { GET as LIST, POST as CREATE } from "./route";
import { GET as READ, PATCH } from "./[slug]/route";
import { POST as ADD_PHOTO, PUT as ORDER_PHOTOS } from "./[slug]/images/route";

const ADMIN = { id: "a1", app_metadata: { role: "admin" } };
const CUSTOMER = { id: "c1", app_metadata: { role: "customer" } };
const REFERENCE = {
  categories: [{ slug: "sleeveless-frocks", name: "Sleeveless Frocks" }],
  genders: [{ slug: "girl", name: "Girl" }],
  sizes: [{ slug: "0-3m", name: "0-3M" }, { slug: "1-2y", name: "1-2Y" }],
  colors: [{ slug: "pine-cone", name: "Pine Cone", hex_code: "#ccc" }],
};
const PRODUCT = {
  slug: "frock-pine",
  name: "Pine Cone Frock",
  variants: [{ slug: "frock-pine-0-3m-pine-cone", size_slug: "0-3m", size_name: "0-3M", price: 923, stock_quantity: 2 }],
  images: [],
};
const params = (slug = "frock-pine") => ({ params: Promise.resolve({ slug }) });
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  h.user = ADMIN;
  h.fetchReference.mockResolvedValue(REFERENCE);
  h.fetchProduct.mockResolvedValue(PRODUCT);
});

describe("admin gate", () => {
  it("refuses signed-out callers and customers before creating the service-role client", async () => {
    h.user = null;
    expect((await LIST()).status).toBe(401);
    h.user = CUSTOMER;
    expect((await LIST()).status).toBe(403);
    expect((await PATCH(json("http://x/api/admin/products/frock-pine", "PATCH", {}), params())).status).toBe(403);
    expect((await ORDER_PHOTOS(json("http://x", "PUT", { urls: [] }), params())).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/products", () => {
  it("returns the list and the form choices, never cached", async () => {
    h.fetchProductList.mockResolvedValue([{ slug: "frock-pine" }]);
    const res = await LIST();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ products: [{ slug: "frock-pine" }], reference: REFERENCE });
  });
});

describe("POST /api/admin/products", () => {
  const body = { name: "New Frock", category_slug: "sleeveless-frocks", gender_slug: "girl", color_slug: "pine-cone", sizes: [{ size_slug: "0-3m", price: 923, stock: 1 }] };

  it("creates the product and returns its slug", async () => {
    h.createProduct.mockResolvedValue("new-frock");
    const res = await CREATE(json("http://x", "POST", body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ slug: "new-frock" });
    expect(h.createProduct.mock.calls[0][1]).toMatchObject({ slug: "new-frock", color_slug: "pine-cone" });
  });

  it("returns the rule that failed as a 400", async () => {
    const res = await CREATE(json("http://x", "POST", { ...body, sizes: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Add at least one size" });
    expect(h.createProduct).not.toHaveBeenCalled();
  });

  it("passes a taken web address through as a 409", async () => {
    h.createProduct.mockRejectedValue(new ProductError("A product with this web address already exists", 409));
    expect((await CREATE(json("http://x", "POST", body))).status).toBe(409);
  });
});

describe("/api/admin/products/[slug]", () => {
  it("404s for an unknown or malformed slug", async () => {
    h.fetchProduct.mockResolvedValue(null);
    expect((await READ(new NextRequest("http://x"), params())).status).toBe(404);
    expect((await READ(new NextRequest("http://x"), params("../etc"))).status).toBe(404);
  });

  it("saves only sizes of this product and returns any stock conflicts", async () => {
    h.saveProduct.mockResolvedValue({ product: PRODUCT, conflicts: [{ size_name: "0-3M", stock_now: 1 }] });
    const ok = await PATCH(json("http://x", "PATCH", { variants: [{ slug: "frock-pine-0-3m-pine-cone", stock: { from: 2, to: 3 } }] }), params());
    expect(ok.status).toBe(200);
    expect((await ok.json()).conflicts).toEqual([{ size_name: "0-3M", stock_now: 1 }]);
    expect(h.saveProduct.mock.calls[0][2]).toEqual({ details: undefined, variants: [{ slug: "frock-pine-0-3m-pine-cone", stock: { from: 2, to: 3 } }], add_sizes: [] });

    const foreign = await PATCH(json("http://x", "PATCH", { variants: [{ slug: "other-0-3m-pine-cone", price: 1 }] }), params());
    expect(foreign.status).toBe(400);
    expect(h.saveProduct).toHaveBeenCalledTimes(1);
  });

  it("hides unexpected errors behind a plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.saveProduct.mockRejectedValue(new Error("connection reset"));
    const res = await PATCH(json("http://x", "PATCH", { variants: [{ slug: "frock-pine-0-3m-pine-cone", price: 900 }] }), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't save the product" });
  });
});

describe("/api/admin/products/[slug]/images", () => {
  const upload = (blob: Blob | null) => {
    const form = new FormData();
    if (blob) form.append("photo", blob, "photo.jpg");
    return new NextRequest("http://x", { method: "POST", body: form });
  };

  it("builds the variants, uploads them, then appends the photo", async () => {
    h.buildPhotoFiles.mockResolvedValue([{ name: "p-stem.jpg" }]);
    h.uploadPhotoFiles.mockResolvedValue("https://x/media/products/frock-pine/p-stem.jpg");
    const res = await ADD_PHOTO(upload(new Blob([new Uint8Array(10)], { type: "image/jpeg" })), params());
    expect(res.status).toBe(201);
    expect(h.buildPhotoFiles.mock.calls[0][1]).toBe("p-stem");
    expect(h.appendImage).toHaveBeenCalledWith({ tag: "admin-client" }, "frock-pine", "https://x/media/products/frock-pine/p-stem.jpg");
  });

  it("refuses a missing file, a non-image and a file over 4 MB", async () => {
    expect((await ADD_PHOTO(upload(null), params())).status).toBe(400);
    expect((await ADD_PHOTO(upload(new Blob(["x"], { type: "text/plain" })), params())).status).toBe(400);
    expect((await ADD_PHOTO(upload(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/jpeg" })), params())).status).toBe(413);
    expect(h.uploadPhotoFiles).not.toHaveBeenCalled();
  });

  it("explains a photo that is too small, and uploads nothing", async () => {
    h.buildPhotoFiles.mockRejectedValue(new Error("TOO_SMALL"));
    const res = await ADD_PHOTO(upload(new Blob([new Uint8Array(10)], { type: "image/jpeg" })), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Photo is too small (at least 300 × 300 pixels)" });
    expect(h.uploadPhotoFiles).not.toHaveBeenCalled();
  });

  it("saves a new photo order", async () => {
    const res = await ORDER_PHOTOS(json("http://x", "PUT", { urls: ["https://x/2.jpg", "https://x/1.jpg"] }), params());
    expect(res.status).toBe(200);
    expect(h.setImageOrder).toHaveBeenCalledWith({ tag: "admin-client" }, "frock-pine", ["https://x/2.jpg", "https://x/1.jpg"]);
    expect((await ORDER_PHOTOS(json("http://x", "PUT", { urls: [1] }), params())).status).toBe(400);
  });
});

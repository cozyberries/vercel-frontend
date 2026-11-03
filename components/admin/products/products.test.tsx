// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/products/client-photo", () => ({ squareJpeg: vi.fn(async () => new Blob(["jpg"], { type: "image/jpeg" })) }));

import { PhotoManager } from "./PhotoManager";
import { ProductForm } from "./ProductForm";
import { filterProducts } from "@/app/admin/products/products-client";
import type { AdminProduct, ProductListItem, ProductReference } from "@/lib/admin/products/types";

const REFERENCE: ProductReference = {
  categories: [{ slug: "sleeveless-frocks", name: "Sleeveless Frocks" }],
  genders: [{ slug: "girl", name: "Girl" }],
  sizes: [
    { slug: "0-3m", name: "0-3M" },
    { slug: "2-3y", name: "2-3Y" },
    { slug: "3-4y", name: "3-4Y" },
  ],
  colors: [{ slug: "pine-cone", name: "Pine Cone", hex_code: null }],
};

const PRODUCT: AdminProduct = {
  slug: "frock-pine",
  name: "Pine Cone Frock",
  description: "",
  care_instructions: "",
  category_slug: "sleeveless-frocks",
  gender_slug: "girl",
  color_slug: "pine-cone",
  color_name: "Pine Cone",
  features: [],
  images: ["https://x.supabase.co/storage/v1/object/public/media/products/frock-pine/1.jpg", "https://x.supabase.co/storage/v1/object/public/media/products/frock-pine/2.jpg"],
  variants: [
    { slug: "frock-pine-0-3m-pine-cone", size_slug: "0-3m", size_name: "0-3M", price: 923, stock_quantity: 2 },
    { slug: "frock-pine-2-3y-pine-cone", size_slug: "2-3y", size_name: "2-3Y", price: 980, stock_quantity: 0 },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("ProductForm (edit)", () => {
  it("counts stock with − and +, shows the old count, and saves the change with the count it started from", async () => {
    const onSave = vi.fn().mockResolvedValue({ product: { ...PRODUCT, variants: [{ ...PRODUCT.variants[0], stock_quantity: 4 }, PRODUCT.variants[1]] }, conflicts: [] });
    render(<ProductForm mode="edit" product={PRODUCT} reference={REFERENCE} onSave={onSave} />);
    expect(screen.getByRole("button", { name: "No changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "One less 2-3Y" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "One more 0-3M" }));
    fireEvent.click(screen.getByRole("button", { name: "One more 0-3M" }));
    expect(screen.getByLabelText("0-3M stock")).toHaveValue("4");
    expect(screen.getByText("was 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({ variants: [{ slug: "frock-pine-0-3m-pine-cone", stock: { from: 2, to: 4 } }], add_sizes: [] });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved. The shop shows it in about 10 seconds.");
    expect(screen.queryByText("was 2")).not.toBeInTheDocument();
  });

  it("tells the admin which size changed meanwhile and shows its count now", async () => {
    const onSave = vi.fn().mockResolvedValue({ product: PRODUCT, conflicts: [{ size_name: "0-3M", stock_now: 1 }] });
    render(<ProductForm mode="edit" product={PRODUCT} reference={REFERENCE} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("0-3M stock"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved, except 0-3M (now 1): that stock changed while you were editing");
  });

  it("adds a size priced like its neighbour", async () => {
    const onSave = vi.fn().mockResolvedValue({ product: PRODUCT, conflicts: [] });
    render(<ProductForm mode="edit" product={PRODUCT} reference={REFERENCE} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Add a size"), { target: { value: "3-4y" } });
    expect(screen.getByLabelText("3-4Y price")).toHaveValue("980");
    fireEvent.click(screen.getByRole("button", { name: "One more 3-4Y" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].add_sizes).toEqual([{ size_slug: "3-4y", price: 980, stock: 1 }]);
  });

  it("shows a server error", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("2-3Y: price can't be above ₹2,500"));
    render(<ProductForm mode="edit" product={PRODUCT} reference={REFERENCE} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("2-3Y price"), { target: { value: "2600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2-3Y: price can't be above ₹2,500");
  });
});

describe("ProductForm (new)", () => {
  it("fills the web address from the name and sends the whole product", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm mode="new" reference={REFERENCE} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pine Cone Sleeveless Frock" } });
    expect(screen.getByLabelText("Web address")).toHaveValue("pine-cone-sleeveless-frock");
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "sleeveless-frocks" } });
    fireEvent.change(screen.getByLabelText("For"), { target: { value: "girl" } });
    fireEvent.change(screen.getByLabelText("Print"), { target: { value: "pine-cone" } });
    fireEvent.change(screen.getByLabelText("Add a size"), { target: { value: "0-3m" } });
    fireEvent.change(screen.getByLabelText("0-3M price"), { target: { value: "923" } });
    fireEvent.click(screen.getByRole("button", { name: "One more 0-3M" }));
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      name: "Pine Cone Sleeveless Frock",
      slug: "pine-cone-sleeveless-frock",
      category_slug: "sleeveless-frocks",
      gender_slug: "girl",
      color_slug: "pine-cone",
      sizes: [{ size_slug: "0-3m", price: 923, stock: 1 }],
    });
  });

  it("stops following the name once the web address is typed", () => {
    render(<ProductForm mode="new" reference={REFERENCE} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Web address"), { target: { value: "frock-sleeveless-pine-cone" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Something else" } });
    expect(screen.getByLabelText("Web address")).toHaveValue("frock-sleeveless-pine-cone");
  });
});

describe("PhotoManager", () => {
  const ok = (product: AdminProduct) => vi.fn(async () => new Response(JSON.stringify({ product }), { status: 200 }));

  it("shows photos in order with the first marked Main, from the list variant", () => {
    render(<PhotoManager slug="frock-pine" images={PRODUCT.images} onProduct={vi.fn()} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Main")).toBeInTheDocument();
    expect(within(items[0]).getByRole("img")).toHaveAttribute("src", expect.stringMatching(/frock-pine\/1_list\.webp$/));
    expect(screen.getByRole("button", { name: "Move photo 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move photo 2 later" })).toBeDisabled();
  });

  it("moves a photo and saves the new order", async () => {
    const fetchMock = ok(PRODUCT);
    vi.stubGlobal("fetch", fetchMock);
    const onProduct = vi.fn();
    render(<PhotoManager slug="frock-pine" images={PRODUCT.images} onProduct={onProduct} />);
    fireEvent.click(screen.getByRole("button", { name: "Move photo 2 earlier" }));
    await waitFor(() => expect(onProduct).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/products/frock-pine/images");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ urls: [PRODUCT.images[1], PRODUCT.images[0]] });
  });

  it("removes a photo only after confirming", async () => {
    const fetchMock = ok(PRODUCT);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true));
    render(<PhotoManager slug="frock-pine" images={PRODUCT.images} onProduct={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ urls: [PRODUCT.images[1]] });
  });

  it("uploads each chosen photo in turn and shows a server error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ product: PRODUCT }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Photo is too small (at least 300 × 300 pixels)" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const onProduct = vi.fn();
    render(<PhotoManager slug="frock-pine" images={[]} onProduct={onProduct} />);
    expect(screen.getByText(/No photos yet/)).toBeInTheDocument();
    const files = [new File(["a"], "a.heic", { type: "image/heic" }), new File(["b"], "b.jpg", { type: "image/jpeg" })];
    fireEvent.change(screen.getByLabelText("Choose photos"), { target: { files } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Photo is too small");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("photo")).toBeInstanceOf(Blob);
    expect(onProduct).toHaveBeenCalledTimes(1);
  });
});

describe("filterProducts", () => {
  const item = (p: Partial<ProductListItem>): ProductListItem => ({ slug: "x", name: "X", category_name: null, image: null, price: 900, stock: 1, sizes: 1, photos: 1, ...p });
  const list = [
    item({ slug: "frock-pine", name: "Pine Cone Frock", category_name: "Sleeveless Frocks" }),
    item({ slug: "nappy-pine", name: "Pine Cone Nappy", stock: 0 }),
    item({ slug: "towel-pop", name: "Popsicles Towel", photos: 0 }),
  ];

  it("matches every word against name, slug and category", () => {
    expect(filterProducts(list, "pine frock", "all").map((p) => p.slug)).toEqual(["frock-pine"]);
    expect(filterProducts(list, "sleeveless", "all").map((p) => p.slug)).toEqual(["frock-pine"]);
  });

  it("shows only sold-out or photo-less products when asked", () => {
    expect(filterProducts(list, "", "out").map((p) => p.slug)).toEqual(["nappy-pine"]);
    expect(filterProducts(list, "", "no-photos").map((p) => p.slug)).toEqual(["towel-pop"]);
  });
});

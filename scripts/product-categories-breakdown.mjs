#!/usr/bin/env node

/**
 * Generate Product Categories Breakdown from Supabase
 *
 * Fetches Gender, Design, Sleeve type, Pattern, Color, and Main category
 * from Supabase and writes docs/product-categories-breakdown.md.
 *
 * Usage:
 *   node scripts/product-categories-breakdown.mjs
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const OUTPUT_PATH = resolve(process.cwd(), "docs/product-categories-breakdown.md");
const PAGE_SIZE = 1000;

/** Fetch all rows from a table (paginated) to avoid default limit truncation. */
async function fetchAllRows(supabaseClient, table, select) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseClient
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

function inferSleeveType(name) {
  if (!name) return "Full sleeve / Other";
  const n = String(name);
  if (n.includes("Butterfly Sleeve")) return "Butterfly Sleeve";
  if (n.includes("Half Sleeve")) return "Half Sleeve";
  if (n.includes("Sleeveless")) return "Sleeveless";
  if (n.includes("Ribbed")) return "Full sleeve (ribbed)";
  if (n.includes("Loose Fit")) return "Loose Fit";
  return "Full sleeve / Other";
}

function inferDesign(name) {
  if (!name) return "Standard / Plain";
  const n = String(name);
  if (n.includes("Chinese Collar")) return "Chinese Collar";
  if (n.includes("Layered")) return "Layered";
  if (n.includes("Ruffle")) return "Ruffle";
  if (n.includes("Japanese")) return "Japanese";
  if (n.includes("Modern")) return "Modern";
  if (n.includes("Loose Fit")) return "Loose Fit";
  if (n.includes("Ribbed")) return "Ribbed";
  if (n.includes("Butterfly Sleeve")) return "Butterfly Sleeve";
  if (n.includes("Half Sleeve")) return "Half Sleeve";
  if (n.includes("Sleeveless")) return "Sleeveless";
  return "Standard / Plain";
}

async function run() {
  console.log("Fetching data from Supabase...");

  const [
    { data: genders, error: eG },
    { data: categories, error: eC },
    { data: colors, error: eCol },
  ] = await Promise.all([
    supabase.from("genders").select("id, name, display_order").order("display_order"),
    supabase.from("categories").select("id, name, slug, display").order("name"),
    supabase.from("colors").select("id, name, hex_code").order("name"),
  ]);

  if (eG || eC || eCol) {
    console.error("Supabase errors:", { eG, eC, eCol });
    process.exit(1);
  }

  let productsList;
  let variantsList;
  try {
    productsList = await fetchAllRows(supabase, "products", "id, name, gender_id, category_id");
    variantsList = await fetchAllRows(supabase, "product_variants", "id, product_id, color_id, size_slug");
  } catch (err) {
    console.error("Supabase fetch error:", err);
    process.exit(1);
  }

  const colorsList = colors || [];

  // Gender counts
  const genderCount = new Map((genders || []).map((g) => [g.id, 0]));
  productsList.forEach((p) => {
    if (p.gender_id) genderCount.set(p.gender_id, (genderCount.get(p.gender_id) || 0) + 1);
  });

  // Category counts
  const categoryCount = new Map((categories || []).map((c) => [c.id, 0]));
  productsList.forEach((p) => {
    if (p.category_id) categoryCount.set(p.category_id, (categoryCount.get(p.category_id) || 0) + 1);
  });

  // Design & Sleeve (from product name)
  const designCount = new Map();
  const sleeveCount = new Map();
  productsList.forEach((p) => {
    const design = inferDesign(p.name);
    const sleeve = inferSleeveType(p.name);
    designCount.set(design, (designCount.get(design) || 0) + 1);
    sleeveCount.set(sleeve, (sleeveCount.get(sleeve) || 0) + 1);
  });

  // Color/pattern: variant counts and product counts per color
  const colorVariantCount = new Map();
  const colorProductCount = new Map();
  variantsList.forEach((v) => {
    if (v.color_id) {
      colorVariantCount.set(v.color_id, (colorVariantCount.get(v.color_id) || 0) + 1);
      const pid = v.product_id;
      if (!colorProductCount.has(v.color_id)) colorProductCount.set(v.color_id, new Set());
      colorProductCount.get(v.color_id).add(pid);
    }
  });

  const totalProducts = productsList.length;

  // Build markdown
  const lines = [
    "# Product Categories – Full Breakdown (Supabase)",
    "",
    "This document is generated from **Supabase** (`cozyberries-db`). It breaks down product taxonomy by **Gender**, **Design**, **Sleeve type**, **Pattern**, **Color**, and **Main category**.",
    "",
    "---",
    "",
    "## 1. Gender",
    "",
    "Stored in `genders`; products link via `products.gender_id`.",
    "",
    "| Gender  | Display order | Product count |",
    "|---------|----------------|---------------|",
  ];

  (genders || []).forEach((g) => {
    lines.push(`| ${g.name}     | ${g.display_order ?? ""}              | ${genderCount.get(g.id) ?? 0}            |`);
  });
  lines.push("", "**Total products:** " + totalProducts, "", "---", "", "## 2. Design", "");
  lines.push(
    "Design/style is **not** stored in a dedicated column; it is inferred from **product name** (e.g. \"Modern\", \"Japanese\", \"Ruffle\"). Values below are derived from name patterns.",
    "",
    "| Design / style     | Product count |",
    "|--------------------|---------------|"
  );
  [...designCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([design, count]) => {
      lines.push(`| ${design.padEnd(18)} | ${String(count).padStart(13)} |`);
    });

  lines.push("", "---", "", "## 3. Sleeve type", "");
  lines.push(
    "Also inferred from **product name** (no dedicated column).",
    "",
    "| Sleeve type           | Product count |",
    "|-----------------------|---------------|"
  );
  [...sleeveCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([sleeve, count]) => {
      lines.push(`| ${sleeve.padEnd(21)} | ${String(count).padStart(13)} |`);
    });

  lines.push("", "---", "", "## 4. Pattern", "");
  lines.push(
    "Patterns are stored as **color/print names** in the `colors` table and used in `product_variants.color_id`. Each \"color\" can represent a print (e.g. Moons And Stars, Popsicles).",
    "",
    "| Pattern name   | Hex code | Product count |",
    "|----------------|----------|---------------|"
  );
  const colorsWithUsage = colorsList
    .filter((c) => colorProductCount.has(c.id))
    .map((c) => ({
      ...c,
      product_count: colorProductCount.get(c.id).size,
      variant_count: colorVariantCount.get(c.id) || 0,
    }))
    .sort((a, b) => b.product_count - a.product_count);
  colorsWithUsage.forEach((c) => {
    const hex = c.hex_code || "—";
    lines.push(`| ${(c.name || "").padEnd(14)} | ${String(hex).padEnd(7)} | ${String(c.product_count).padStart(13)} |`);
  });

  lines.push("", "---", "", "## 5. Color", "");
  lines.push(
    "Same as **Pattern**: `colors` table; usage from `product_variants`. Only colors with at least one variant are included.",
    "",
    "| Color name    | Hex code | Variant count | Product count |",
    "|---------------|----------|----------------|---------------|"
  );
  colorsWithUsage.forEach((c) => {
    const hex = (c.hex_code || "—").toString();
    lines.push(
      `| ${(c.name || "").padEnd(12)} | ${hex.padEnd(7)} | ${String(c.variant_count).padStart(14)} | ${String(c.product_count).padStart(13)} |`
    );
  });
  lines.push(
    "",
    "*Colors with 0 variants (e.g. Coconut Milk, Naughty Nuts, Rocket Rangers) exist in DB but are not listed above.*",
    "",
    "---",
    "",
    "## 6. Main category",
    "",
    "Stored in `categories`; products link via `products.category_id`.",
    "",
    "| Category                | Slug                    | Display | Product count |",
    "|-------------------------|-------------------------|---------|---------------|"
  );
  (categories || []).forEach((c) => {
    const disp = c.display ? "Yes" : "No";
    const count = categoryCount.get(c.id) ?? 0;
    lines.push(`| ${(c.name || "").padEnd(23)} | ${(c.slug || "").padEnd(22)} | ${disp.padEnd(7)} | ${String(count).padStart(13)} |`);
  });

  lines.push(
    "",
    "**Total products (by category):** " + totalProducts,
    "",
    "---",
    "",
    "## Summary",
    "",
    "| Dimension     | Source in DB                    | Count / note |",
    "|---------------|----------------------------------|--------------|",
    "| **Gender**    | `genders` + `products.gender_id` | " + (genders || []).length + " values (Boy, Girl, Unisex) |",
    "| **Design**    | Inferred from `products.name`     | " + designCount.size + " design/style types |",
    "| **Sleeve type** | Inferred from `products.name`   | " + sleeveCount.size + " sleeve types |",
    "| **Pattern**   | `colors` (as print names)         | " + colorsWithUsage.length + " patterns in use |",
    "| **Color**     | `colors` + `product_variants`     | " + colorsWithUsage.length + " colors in use |",
    "| **Main category** | `categories` + `products.category_id` | " + (categories || []).length + " categories |",
    "",
    "To regenerate this breakdown from Supabase, run:",
    "",
    "```bash",
    "node scripts/product-categories-breakdown.mjs",
    "```",
    "",
    "This will overwrite `docs/product-categories-breakdown.md` with fresh data.",
    ""
  );

  writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf8");
  console.log("✅ Wrote " + OUTPUT_PATH);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

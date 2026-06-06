#!/usr/bin/env node

/**
 * Apply category-level product descriptions + features from description.txt chat copy.
 *
 * Usage:
 *   node scripts/update-product-copy-from-chat.mjs [--dry-run]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** @type {Record<string, { description: string; features: string[] }>} */
const COPY = {
  "boys-coord-sets": {
    description:
      "Chinese collar shirt and shorts muslin co-ord set crafted for everyday comfort and effortless style. Made from soft, breathable muslin that feels gentle on delicate skin, this outfit allows little ones to move freely through playtime, outings, and special moments. The clean Chinese collar adds a smart touch while the relaxed shorts keep kids comfortable all day.",
    features: [
      "Lightweight muslin fabric suitable for all weather conditions",
      "Charming prints with a modern silhouette for a stylish everyday look",
      "Versatile two-piece outfit that can be styled separately with other pieces",
      "Soft, skin-friendly fabric with durable stitching made for active little explorers",
      "Elastic waistband shorts for quick dressing and easy movement",
    ],
  },
  "frock-japanese": {
    description:
      "Japanese pan collar frock designed with a soft, relaxed shape for little ones. Crafted from breathable muslin in gentle pastel tones, this dress feels light and comfortable on delicate skin. The classic pan collar adds a sweet vintage touch, while the loose body and gathered design create an airy, playful look. With softly elasticated cuffs and relaxed sleeves, it's a charming outfit for everyday wear, outings, playdates, and special moments.",
    features: [
      "Classic Japanese-style pan collar for a timeless, elegant look",
      "Loose and airy design that allows easy movement for little ones",
      "Gentle elastic cuffs with relaxed sleeves for added comfort",
      "Breathable muslin fabric suitable for all weather conditions",
      "Soft pastel tones with delicate prints for a sweet, minimal aesthetic",
    ],
  },
  "frock-collar": {
    description:
      "Half-sleeve collar frock designed for a neat and charming everyday look. Made from soft, breathable muslin that feels gentle on delicate skin, it keeps little ones comfortable throughout the day. The classic collar, front buttons, and gathered design add a cute and stylish touch, making it perfect for daily wear, family time, and little celebrations.",
    features: [
      "Classic collar design for a smart and polished look",
      "Comfortable half sleeves for easy everyday wear",
      "Breathable muslin fabric suitable for all weather conditions",
      "Front button closure for easy dressing and quick changes",
      "Soft gathered design that gives a cute and airy appearance",
    ],
  },
  "frock-frill": {
    description:
      "Butterfly sleeve muslin frock designed with a soft, playful look for little ones. Made from breathable muslin that feels gentle on delicate skin and keeps kids comfortable all day. The fluttery butterfly sleeves and front button detailing add a charming touch, while the gathered waist creates a cute, flowy shape. Finished with adorable prints, it's perfect for everyday wear and little celebrations.",
    features: [
      "Fluttery butterfly sleeves for a cute and playful look",
      "Front button detailing for easy dressing",
      "Breathable muslin fabric suitable for all weather conditions",
      "Soft gathered waist design for a light and airy feel",
      "Charming prints for a sweet and playful style",
    ],
  },
  "frock-sleeveless": {
    description:
      "Sleeveless muslin frock designed with a light and playful look for little ones. The sleeveless style and front button detailing add a simple, charming touch, while the gathered design creates a cute, airy shape. Finished with adorable prints, it's a lovely choice for daily wear and little celebrations.",
    features: [
      "Comfortable sleeveless design for easy movement",
      "Front button detailing for quick and easy dressing",
      "Breathable muslin fabric suitable for all weather conditions",
      "Soft gathered design for a light and flowy look",
      "Cute playful prints for an adorable everyday style",
    ],
  },
  "girls-coord-ruffle": {
    description:
      "This muslin co-ord set is designed with a light and playful feel for little ones. The top features delicate ruffled sleeves and soft gathers at the waist, allowing comfortable movement for sitting, crawling, and play. Paired with matching shorts finished with gentle ruffled hems, the set adds a charming touch to everyday wear while keeping kids comfortable all day.",
    features: [
      "Designed to support comfortable play and everyday activities",
      "Ruffled sleeve detailing and matching shorts finished with delicate frill edges for a charming look",
      "Elasticated waist with gentle gathers for easy movement and comfortable play",
    ],
  },
  "girls-coord-layered": {
    description:
      "This muslin co-ord set is designed with a light and playful feel for little ones. The top features soft sleeves and a charming layered design that adds a flowy, playful look while allowing easy movement during playtime. Paired with matching shorts and finished with cute prints, the set brings a sweet touch to everyday wear while keeping kids comfortable throughout the day.",
    features: [
      "Layered top design for a playful and flowy look",
      "Elasticated shorts for easy wear and comfortable movement",
      "Adorable all-over prints for a cute everyday style",
      "Designed to support comfortable play and daily activities",
    ],
  },
  "girls-coord-bow": {
    description:
      "This muslin co-ord set is designed with a sweet and playful charm for little ones. The top features soft sleeves with gentle gathers and a cute bow detailing at the front, adding an adorable touch to the outfit. Paired with matching shorts and finished with pretty prints, the set creates a lovely everyday look while keeping kids comfortable during play and movement.",
    features: [
      "Cute bow detailing on the top for an adorable look",
      "Soft gathered design that allows comfortable movement",
      "Elasticated shorts for easy wear and flexibility",
      "Pretty all-over prints for a charming everyday style",
    ],
  },
  "half-sleeve-jabla-and-shorts": {
    description:
      "This half-sleeve jabla and shorts set is designed for a comfortable and playful everyday look. The jabla top features front button detailing for easy dressing and a relaxed fit that allows little ones to move freely. Paired with matching shorts, the set offers a light and easy outfit perfect for daily wear and playtime.",
    features: [
      "Half-sleeve jabla design for a relaxed and easy fit",
      "Front button detailing for quick and convenient dressing",
      "Elasticated shorts for comfortable movement",
    ],
  },
  "newborn-essentials": {
    description:
      "This newborn essentials set is thoughtfully designed to keep little ones comfortable during their first days. It includes a knotted jabla and a two-layered nappy, which provides extra absorption for everyday comfort. The cap, mittens, and booties help keep the baby warm during the initial days, while the bath towel and swaddle provide cozy wrapping after bath time or rest. A useful starter set for newborns and a thoughtful gift for new moms.",
    features: [
      "Knotted jabla with a two-layered nappy for easy changing and added absorption",
      "Cap, mittens, and booties to help keep baby warm",
      "Absorbent bath cloth for after-bath comfort (Towel: 70×70 cm) and a swaddle for cozy wrapping (Swaddle: 100×100 cm)",
      "A complete starter kit with essentials every newborn needs",
    ],
  },
  "pyjamas-without-rib": {
    description:
      "This pyjama set comes with a full-sleeve top paired with full-length pants, creating a cozy outfit for little ones. The top features front button detailing for easy dressing, while the comfortable design allows children to move freely during play or rest. Paired with matching pants and finished with cute prints, the set offers a breathable and gentle option for everyday comfort and peaceful sleep.",
    features: [
      "Thoughtfully designed with full sleeves and full-length pants to keep little ones comfortably covered during sleep",
      "Button-down front for quick and easy dressing",
      "Elasticated waistband that offers a flexible and secure fit",
      "Lightweight outfit suitable for daily wear and bedtime comfort",
    ],
  },
  "pyjamas-with-rib": {
    description:
      "This pyjama set comes with a full-sleeve top with ribbed cuffs paired with full-length pants with ribbed hems, creating a cozy outfit for little ones. The top features front button detailing for easy dressing, while the comfortable design allows children to move freely during play or rest. Paired with matching pants and finished with cute prints, the set offers a breathable and gentle option for everyday comfort and peaceful sleep.",
    features: [
      "Ribbed sleeve cuffs and pant hems for a snug fit",
      "Button-down front for quick and easy dressing",
      "Elasticated waistband that offers a flexible and secure fit",
      "Lightweight outfit suitable for daily wear and bedtime comfort",
    ],
  },
  "rompers-unisex": {
    description:
      "This romper features half sleeves and a knee-length design, creating a light and comfortable outfit for little ones. The front showcases button detailing and is made with soft, breathable fabric, keeping children comfortable throughout the day while allowing easy movement during play or rest. A gentle and airy option for everyday comfort.",
    features: [
      "Comfortable short sleeves with a relaxed knee-length fit",
      "Classic front opening with button accents",
      "Snap buttons at the bottom for quick and easy diaper changes",
      "Lightweight outfit suitable for daily wear and comfort",
    ],
  },
  "rompers-girls": {
    description:
      "This romper features a loose and airy silhouette, designed especially for girls to stay comfortable throughout the day. The neckline is finished with a soft frill collar detailing, adding a sweet and delicate touch. Made with lightweight and breathable fabric, the relaxed design allows easy movement during play or rest. A gentle and comfortable choice for everyday wear, designed in a thigh-length style for girls.",
    features: [
      "Delicate frilled neckline for a sweet and stylish look",
      "Indonesian-style loose fit romper for a flowy and comfortable feel",
      "Elasticated sleeve ends for a soft and gentle hold on the arms",
      "Bottom snap closures for quick and convenient diaper changes",
    ],
  },
  "sleeveless-jabla-and-shorts": {
    description:
      "This set includes a sleeveless jabla paired with matching shorts, creating a light and comfortable outfit for little ones. The top features front button detailing for easy dressing, while the airy design helps keep children cool during warm days. The sleeveless top and relaxed fit allow free movement during play or rest. A gentle and comfortable option for everyday wear.",
    features: [
      "Arm-free upper with an easy fit for cool and comfortable movement",
      "Buttoned front placket for quick changing",
      "Stretch waistband on bottoms for an easy and flexible fit",
      "Two-piece coordinated set suitable for warm-weather days",
    ],
  },
  "sleeveless-jablas": {
    description:
      "This sleeveless jabla keeps little ones cool and comfortable throughout the day. It features front button detailing for easy dressing and an airy design that allows free movement during play or rest. A light and comfortable choice for everyday wear.",
    features: [
      "Sleeveless design with front button opening for easy dressing and better airflow",
      "Neatly finished neckline for added comfort",
      "Single-piece top suitable for daily wear",
    ],
  },
};

function resolveCopyKey(product) {
  const { slug, category_slug, name } = product;

  switch (category_slug) {
    case "boys-coord-sets":
      return "boys-coord-sets";
    case "frocks":
      if (slug.startsWith("frock-japanese")) return "frock-japanese";
      if (slug.startsWith("frock-modern")) return "frock-collar";
      if (slug.startsWith("frock-butterfly-sleeve")) return "frock-frill";
      if (slug.startsWith("frock-sleeveless")) return "frock-sleeveless";
      return null;
    case "girls-coord-sets":
      if (slug.startsWith("coords-set-ruffle") || slug === "jhabla-shorts-half-sleeve-soft-pear")
        return "girls-coord-ruffle";
      if (slug.startsWith("coords-set-layered")) return "girls-coord-layered";
      if (slug.startsWith("coords-set-half-sleeve")) return "girls-coord-bow";
      return null;
    case "half-sleeve-jabla-and-shorts":
      return "half-sleeve-jabla-and-shorts";
    case "newborn-essentials":
      return "newborn-essentials";
    case "pyjamas":
      if (name.includes("Without Rib")) return "pyjamas-without-rib";
      if (name.includes("With Rib")) return "pyjamas-with-rib";
      return null;
    case "rompers":
      if (slug.startsWith("rompers-unisex")) return "rompers-unisex";
      if (slug.startsWith("rompers-girls-only")) return "rompers-girls";
      return null;
    case "sleeveless-jabla-and-shorts":
      return "sleeveless-jabla-and-shorts";
    case "sleeveless-jablas":
      return "sleeveless-jablas";
    default:
      return null;
  }
}

async function run() {
  const { data: products, error } = await supabase
    .from("products")
    .select("slug, name, category_slug")
    .order("name");

  if (error) {
    console.error("Failed to fetch products:", error.message);
    process.exit(1);
  }

  const unresolved = [];
  const updates = [];

  for (const product of products) {
    const key = resolveCopyKey(product);
    const copy = key ? COPY[key] : null;
    if (!copy) {
      unresolved.push(product);
      continue;
    }
    updates.push({ ...product, key, ...copy });
  }

  if (unresolved.length > 0) {
    console.error("Unresolved products:");
    for (const p of unresolved) console.error(`  - ${p.slug} (${p.category_slug})`);
    process.exit(1);
  }

  console.log(`Resolved copy for ${updates.length} products.`);

  if (DRY_RUN) {
    for (const u of updates) {
      console.log(`\n[${u.slug}] key=${u.key}`);
      console.log(`  desc: ${u.description.slice(0, 80)}...`);
      console.log(`  features: ${u.features.length}`);
    }
    return;
  }

  for (const u of updates) {
    const { error: descError } = await supabase
      .from("products")
      .update({ description: u.description, updated_at: new Date().toISOString() })
      .eq("slug", u.slug);

    if (descError) {
      console.error(`Failed description for ${u.slug}:`, descError.message);
      process.exit(1);
    }

    const { error: delError } = await supabase
      .from("product_features")
      .delete()
      .eq("product_slug", u.slug);

    if (delError) {
      console.error(`Failed delete features for ${u.slug}:`, delError.message);
      process.exit(1);
    }

    const rows = u.features.map((feature, display_order) => ({
      product_slug: u.slug,
      feature,
      display_order,
    }));

    const { error: insError } = await supabase.from("product_features").insert(rows);

    if (insError) {
      console.error(`Failed insert features for ${u.slug}:`, insError.message);
      process.exit(1);
    }

    console.log(`Updated ${u.slug}`);
  }

  console.log("Done.");
}

run();

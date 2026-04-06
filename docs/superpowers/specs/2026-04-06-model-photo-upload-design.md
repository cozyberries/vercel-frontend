# Design: Model Photo Upload Script

**Date:** 2026-04-06
**Status:** Approved

## Overview

Upload 28 finalised product model photoshoot images into Supabase Storage and make each the first image for its product. Existing images are preserved by shifting down one slot (1.jpg → 2.jpg, etc.).

## Context

- **Source directory:** `/Users/abdul.azeez/Personal/cozyberries/Product Model Photoshoots/Finalised/`
- **Structure:** `Finalised/{product_slug}/1.jpg` (plus `input`/`raw` subdirs to ignore)
- **Products:** 28 slugs — all confirmed present in Supabase `products` table
- **Supabase storage bucket:** `media`
- **Storage path pattern:** `products/{slug}/{n}.jpg`
- **DB table:** `product_images` — columns: `product_slug`, `url`, `is_primary` (bool), `display_order` (int), `created_at`
- **URL pattern:** `https://{SUPABASE_URL}/storage/v1/object/public/media/products/{slug}/{n}.jpg`
- **Existing file formats:** `.jpg` only (plus `raw` subfolder present in many products — ignored)

## Script

**File:** `scripts/upload-model-photos.mjs`
**Runtime:** Node.js — uses `@supabase/supabase-js` and `dotenv`
**Env:** reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`

### Invocation

```bash
# Dry-run (default — no changes made, logs what would happen)
node scripts/upload-model-photos.mjs

# Execute (applies all changes)
node scripts/upload-model-photos.mjs --execute
```

## Per-Product Logic

For each of the 28 product slugs, in order:

### 1. Validate local file
- Check `Finalised/{slug}/1.jpg` exists and is readable.
- If missing: log a warning and skip this product (do not fail the run).

### 2. List existing storage files
- Call `supabase.storage.from('media').list('products/{slug}')`.
- Filter to files matching `/^\d+\.jpg$/` only — ignore `raw`, `input`, and any other non-numeric-jpg entries.
- Sort numerically by filename (1, 2, 3…).

### 3. Shift existing files down (storage)
- Move in **reverse order** (highest number first) to avoid collisions:
  - e.g. for 5 files: `5.jpg→6.jpg`, `4.jpg→5.jpg`, `3.jpg→4.jpg`, `2.jpg→3.jpg`, `1.jpg→2.jpg`
- Uses `supabase.storage.from('media').move(src, dest)` for each.

### 4. Upload new model photo
- Upload local `Finalised/{slug}/1.jpg` → `products/{slug}/1.jpg`
- `contentType: 'image/jpeg'`, `upsert: false` (slot is empty after the move above).

### 5. Rebuild DB rows
- **Delete** all existing `product_images` rows where `product_slug = slug`.
- **Reinsert** all rows sequentially:
  - Row 1: new model photo — `display_order=1`, `is_primary=true`
  - Rows 2…N: shifted existing images in their original sort order — `display_order=2,3,4…`, `is_primary=false`
- URL for each row: constructed from `SUPABASE_URL` + `/storage/v1/object/public/media/products/{slug}/{n}.jpg`

> **Note:** `display_order` values are renumbered sequentially (1, 2, 3…) regardless of previous values, cleaning up any existing gaps (e.g. rocket-rangers previously had gaps at 6, 7).

## Error Handling

- **Per-product isolation:** a failure on one product (storage move error, upload error, DB error) logs the error and continues to the next product — the run does not abort.
- **Non-zero exit code** if any product failed.

## Logging

### Dry-run mode
```
[DRY RUN] coords-set-rocket-rangers
  Would move: products/coords-set-rocket-rangers/5.jpg → 6.jpg
  Would move: products/coords-set-rocket-rangers/4.jpg → 5.jpg
  ...
  Would upload: Finalised/.../1.jpg → products/coords-set-rocket-rangers/1.jpg
  Would upsert DB: 6 rows (display_order 1–6)
```

### Execute mode
```
[coords-set-rocket-rangers] Shifting 5 files...
[coords-set-rocket-rangers] ✓ Moved 1.jpg → 2.jpg
...
[coords-set-rocket-rangers] ✓ Uploaded model photo → 1.jpg
[coords-set-rocket-rangers] ✓ DB rebuilt (6 rows)
```

### Summary (both modes)
```
Done: 27 succeeded, 1 failed
Failed: frock-japanese-soft-pear (see error above)
```

## Decisions Not Made Here

- Cache/CDN invalidation: Supabase public storage URLs are served with cache headers. Since the new `1.jpg` is a new file (the old one was moved), no cache-busting is needed — the URL is the same path but the file slot was vacated and re-uploaded fresh.
- This script is a one-time migration tool, not a recurring process.

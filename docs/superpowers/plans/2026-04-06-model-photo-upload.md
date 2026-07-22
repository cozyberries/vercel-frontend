# Model Photo Upload Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a one-time Node.js migration script that uploads 28 finalised model photoshoots to Supabase Storage as the first image for each product, shifting all existing images down by one slot.

**Architecture:** Single `scripts/upload-model-photos.mjs` ESM script. Dry-run by default (`--execute` to apply). Discovers slugs from the local Finalised directory at runtime. Processes each product independently — failures are isolated and do not abort the run. Storage shift uses reverse-order moves to avoid collisions; DB is rebuilt via delete + reinsert.

**Tech Stack:** Node.js ESM, `@supabase/supabase-js`, `dotenv`, `fs/promises`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/upload-model-photos.mjs` | Complete migration script — slug discovery, storage shift, upload, DB rebuild, orchestration |

---

### Task 1: Scaffold — imports, env loading, arg parsing, Supabase client

**Files:**
- Create: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Create the script with all imports and bootstrap**

```js
// scripts/upload-model-photos.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readdir, access, readFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const EXECUTE = process.argv.includes('--execute');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'media';
const SOURCE_DIR = '/Users/abdul.azeez/Personal/cozyberries/Product Model Photoshoots/Finalised';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

console.log(EXECUTE ? '🚀 EXECUTE mode' : '🔍 DRY RUN mode (pass --execute to apply changes)');
```

- [ ] **Step 2: Verify env loads correctly**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs
```

Expected output:
```
🔍 DRY RUN mode (pass --execute to apply changes)
```

- [ ] **Step 3: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): scaffold model photo upload script"
```

---

### Task 2: Slug discovery and local photo validation

**Files:**
- Modify: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Append slug discovery and local photo validation functions**

```js
async function discoverSlugs() {
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

async function validateLocalPhoto(slug) {
  const photoPath = join(SOURCE_DIR, slug, '1.jpg');
  try {
    await access(photoPath);
    return photoPath;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add a temporary smoke test — append to bottom of file**

```js
const slugs = await discoverSlugs();
console.log(`Found ${slugs.length} product slugs:`, slugs);
```

- [ ] **Step 3: Run and verify**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs
```

Expected:
```
🔍 DRY RUN mode (pass --execute to apply changes)
Found 28 product slugs: [ 'coords-set-chinese-collar-soft-pear', ... ]
```

- [ ] **Step 4: Remove the temporary smoke test lines added in Step 2**

- [ ] **Step 5: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): add slug discovery and local photo validation"
```

---

### Task 3: List and filter existing storage files for a product

**Files:**
- Modify: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Append storage listing function**

```js
const IMAGE_FILE_RE = /^\d+\.jpg$/i;

async function listProductStorageFiles(slug) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`products/${slug}`);
  if (error) throw new Error(`Storage list failed for ${slug}: ${error.message}`);
  return (data || [])
    .map(f => f.name)
    .filter(name => IMAGE_FILE_RE.test(name))
    .sort((a, b) => parseInt(a) - parseInt(b)); // numeric sort: 1.jpg < 2.jpg < 10.jpg
}
```

- [ ] **Step 2: Add a temporary smoke test — append to bottom of file**

```js
const testFiles = await listProductStorageFiles('coords-set-rocket-rangers');
console.log('coords-set-rocket-rangers storage files:', testFiles);
```

- [ ] **Step 3: Run and verify**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs
```

Expected (the `raw` folder must NOT appear):
```
coords-set-rocket-rangers storage files: [ '1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg' ]
```

- [ ] **Step 4: Remove the temporary smoke test lines added in Step 2**

- [ ] **Step 5: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): add storage file listing with numeric jpg filter"
```

---

### Task 4: Shift existing storage files down by one slot

**Files:**
- Modify: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Append storage shift function**

```js
async function shiftStorageFilesDown(slug, files, execute) {
  // files is sorted ascending: ['1.jpg', '2.jpg', ...]
  // Reverse so we move highest first, avoiding overwrites (5→6 before 4→5, etc.)
  const reversed = [...files].reverse();
  for (const file of reversed) {
    const n = parseInt(file);
    const src = `products/${slug}/${n}.jpg`;
    const dest = `products/${slug}/${n + 1}.jpg`;
    if (!execute) {
      console.log(`  [DRY RUN] Would move: ${src} → ${n + 1}.jpg`);
      continue;
    }
    const { error } = await supabase.storage.from(BUCKET).move(src, dest);
    if (error) throw new Error(`Storage move failed ${src} → ${dest}: ${error.message}`);
    console.log(`  [${slug}] ✓ Moved ${n}.jpg → ${n + 1}.jpg`);
  }
}
```

- [ ] **Step 2: Add a temporary dry-run smoke test — append to bottom of file**

```js
const testFiles2 = await listProductStorageFiles('frock-japanese-soft-pear');
await shiftStorageFilesDown('frock-japanese-soft-pear', testFiles2, false);
```

- [ ] **Step 3: Run and verify correct reverse order**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs
```

Expected (highest first — 3 then 2 then 1):
```
  [DRY RUN] Would move: products/frock-japanese-soft-pear/3.jpg → 4.jpg
  [DRY RUN] Would move: products/frock-japanese-soft-pear/2.jpg → 3.jpg
  [DRY RUN] Would move: products/frock-japanese-soft-pear/1.jpg → 2.jpg
```

- [ ] **Step 4: Remove the temporary smoke test lines added in Step 2**

- [ ] **Step 5: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): add reverse-order storage file shift function"
```

---

### Task 5: Upload new model photo to storage

**Files:**
- Modify: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Append upload function**

```js
async function uploadModelPhoto(slug, localPath, execute) {
  const destPath = `products/${slug}/1.jpg`;
  if (!execute) {
    console.log(`  [DRY RUN] Would upload: ${localPath} → ${destPath}`);
    return;
  }
  const fileBuffer = await readFile(localPath);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(destPath, fileBuffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Upload failed for ${slug}: ${error.message}`);
  console.log(`  [${slug}] ✓ Uploaded model photo → 1.jpg`);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): add model photo upload function"
```

---

### Task 6: Rebuild product_images DB rows

**Files:**
- Modify: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Append URL builder and DB rebuild function**

```js
function buildImageUrl(slug, n) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/products/${slug}/${n}.jpg`;
}

async function rebuildDbRows(slug, existingFiles, execute) {
  // existingFiles: original sorted list before any shifting, e.g. ['1.jpg', '2.jpg', '3.jpg']
  // After shifting in storage: old 1.jpg is now 2.jpg, old 2.jpg is now 3.jpg, etc.
  // New model photo occupies 1.jpg.
  // Resulting display_orders: 1 (model), 2 (was 1.jpg), 3 (was 2.jpg), ...
  const totalRows = existingFiles.length + 1;
  const rows = [
    {
      product_slug: slug,
      url: buildImageUrl(slug, 1),
      is_primary: true,
      display_order: 1,
    },
    ...existingFiles.map((_, i) => ({
      product_slug: slug,
      url: buildImageUrl(slug, i + 2),
      is_primary: false,
      display_order: i + 2,
    })),
  ];

  if (!execute) {
    console.log(`  [DRY RUN] Would upsert DB: ${totalRows} rows (display_order 1–${totalRows})`);
    return;
  }

  const { error: deleteError } = await supabase
    .from('product_images')
    .delete()
    .eq('product_slug', slug);
  if (deleteError) throw new Error(`DB delete failed for ${slug}: ${deleteError.message}`);

  const { error: insertError } = await supabase
    .from('product_images')
    .insert(rows);
  if (insertError) throw new Error(`DB insert failed for ${slug}: ${insertError.message}`);

  console.log(`  [${slug}] ✓ DB rebuilt (${totalRows} rows)`);
}
```

- [ ] **Step 2: Add a temporary smoke test — append to bottom of file**

```js
await rebuildDbRows('frock-japanese-soft-pear', ['1.jpg', '2.jpg', '3.jpg'], false);
```

- [ ] **Step 3: Run and verify**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs
```

Expected:
```
  [DRY RUN] Would upsert DB: 4 rows (display_order 1–4)
```

- [ ] **Step 4: Remove the temporary smoke test lines added in Step 2**

- [ ] **Step 5: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): add DB row rebuild (delete + reinsert)"
```

---

### Task 7: Per-product orchestration, error isolation, and summary

**Files:**
- Modify: `scripts/upload-model-photos.mjs`

- [ ] **Step 1: Append the orchestration and main function — this replaces any leftover smoke test lines at the bottom**

```js
async function processProduct(slug, execute) {
  const localPath = await validateLocalPhoto(slug);
  if (!localPath) {
    console.warn(`  [SKIP] ${slug}: local 1.jpg not found`);
    return 'skipped';
  }

  const existingFiles = await listProductStorageFiles(slug);

  if (!execute) {
    console.log(`\n[DRY RUN] ${slug} (${existingFiles.length} existing → ${existingFiles.length + 1} after)`);
    await shiftStorageFilesDown(slug, existingFiles, false);
    await uploadModelPhoto(slug, localPath, false);
    await rebuildDbRows(slug, existingFiles, false);
    return 'ok';
  }

  console.log(`\n[${slug}] Shifting ${existingFiles.length} files...`);
  await shiftStorageFilesDown(slug, existingFiles, true);
  await uploadModelPhoto(slug, localPath, true);
  await rebuildDbRows(slug, existingFiles, true);
  return 'ok';
}

async function main() {
  const slugs = await discoverSlugs();
  console.log(`\nFound ${slugs.length} products. Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}\n`);

  const results = { ok: [], skipped: [], failed: [] };

  for (const slug of slugs) {
    try {
      const status = await processProduct(slug, EXECUTE);
      results[status].push(slug);
    } catch (err) {
      console.error(`  [FAIL] ${slug}: ${err.message}`);
      results.failed.push(slug);
    }
  }

  console.log('\n── Summary ──────────────────────────────');
  console.log(`✓ Succeeded: ${results.ok.length}`);
  if (results.skipped.length) console.log(`⚠ Skipped:   ${results.skipped.length} (${results.skipped.join(', ')})`);
  if (results.failed.length) {
    console.log(`✗ Failed:    ${results.failed.length} (${results.failed.join(', ')})`);
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
```

- [ ] **Step 2: Run full dry-run across all 28 products**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs
```

Expected: each of the 28 products logs its Would-move / Would-upload / Would-upsert lines, then:
```
── Summary ──────────────────────────────
✓ Succeeded: 28
```

- [ ] **Step 3: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "feat(scripts): add per-product orchestration and run summary"
```

---

### Task 8: Execute the migration

> No code changes in this task — run the script against production Supabase.

- [ ] **Step 1: Final dry-run review — check first 80 lines**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs 2>&1 | head -80
```

Verify: correct slugs, correct file counts, no unexpected warnings.

- [ ] **Step 2: Run the migration**

```bash
/opt/homebrew/bin/node scripts/upload-model-photos.mjs --execute
```

Expected final output:
```
── Summary ──────────────────────────────
✓ Succeeded: 28
```

- [ ] **Step 3: Spot-check three products in Supabase**

```bash
/opt/homebrew/bin/node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const slugs = ['coords-set-rocket-rangers', 'frock-japanese-soft-pear', 'jhabla-sleeveless-mushie-mini'];
  for (const slug of slugs) {
    const { data } = await sb.from('product_images').select('display_order,is_primary,url').eq('product_slug', slug).order('display_order');
    console.log(slug + ':');
    data.forEach(r => console.log('  order=' + r.display_order + ' primary=' + r.is_primary + ' file=' + r.url.split('/').pop()));
  }
}
main().catch(console.error);
" 2>&1
```

Expected for each product: `order=1 primary=true file=1.jpg`, followed by `primary=false` rows for `2.jpg`, `3.jpg`, etc.

- [ ] **Step 4: Commit**

```bash
git add scripts/upload-model-photos.mjs
git commit -m "chore(scripts): run model photo upload migration (28 products)"
```

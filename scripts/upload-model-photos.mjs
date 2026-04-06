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

async function shiftStorageFilesDown(slug, files, execute) {
  // files is sorted ascending: ['1.jpg', '2.jpg', ...]
  // Move in reverse order to avoid collisions: highest first
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

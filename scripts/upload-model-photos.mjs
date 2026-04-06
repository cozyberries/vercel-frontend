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

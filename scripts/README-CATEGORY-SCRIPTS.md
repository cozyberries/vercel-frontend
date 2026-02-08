# Category Management Scripts

This directory contains utility scripts for managing product categories and ensuring category filters work correctly.

## Available Scripts

### 1. Fix Category Slugs
**File:** `fix-category-slugs.mjs`

Corrects category slugs to match their category names. This is essential for URL routing and filters to work properly.

```bash
# Preview changes
node scripts/fix-category-slugs.mjs --dry-run

# Apply changes
node scripts/fix-category-slugs.mjs
```

**What it does:**
- Fetches all categories from the database
- Generates correct slugs from category names (e.g., "Pyjamas" → "pyjamas")
- Updates any mismatched slugs
- Reports success/failure for each update

### 2. Fix Product Categories
**File:** `fix-product-categories.mjs`

Automatically assigns products to the correct categories based on their product titles using pattern matching.

```bash
# Preview changes
node scripts/fix-product-categories.mjs --dry-run

# Apply changes
node scripts/fix-product-categories.mjs
```

**What it does:**
- Uses smart pattern matching to categorize products by name
- Supports patterns for:
  - Pyjamas (regular and ribbed)
  - Frocks (butterfly sleeve, Japanese, modern, sleeveless)
  - Coord Sets (boys and girls)
  - Rompers (girls only and unisex)
  - Jabla products (sleeveless, with shorts, half-sleeve)
  - Newborn Essential Kits
- Reports which products were updated and which couldn't be mapped

**Pattern Matching Examples:**
- "Pyjama - Joyful Orbs" → Pyjamas
- "Frock Japanese - Lilac Blossom" → Frocks
- "Coords Set - Rocket Rangers" → Boys Coord Sets
- "Rompers - Girls Only Loose Fit" → Rompers
- "Jhabla Sleeveless - Popsicles" → Sleeveless Jablas

### 3. Clear Product Cache
**File:** `clear-product-cache.mjs`

Clears all product and category-related cache entries from Redis. Essential after making category changes.

```bash
node scripts/clear-product-cache.mjs
```

**What it does:**
- Clears all `products:*` cache keys (filtered product lists)
- Clears all `product:*` cache keys (individual products)
- Clears all `categories:*` cache keys
- Reports number of entries cleared

**When to use:**
- After fixing category slugs
- After reassigning product categories
- When category filters aren't showing updated data
- After any bulk category/product updates

### 4. Test Category Filters
**File:** `test-category-filters.mjs`

Comprehensive test suite to verify all category functionality is working correctly.

```bash
node scripts/test-category-filters.mjs
```

**What it tests:**
1. **Category Slugs** - Verifies all slugs match their category names
2. **Product Categories** - Checks all products have valid category assignments
3. **Category Filtering** - Tests that filtering by each category returns correct products
4. **Product Distribution** - Shows how products are distributed across categories

**Exit codes:**
- `0` - All tests passed
- `1` - One or more tests failed

## Common Workflows

### Initial Setup / Fix Everything
If categories are broken, run these scripts in order:

```bash
# 1. Fix category slugs first
node scripts/fix-category-slugs.mjs

# 2. Assign products to correct categories
node scripts/fix-product-categories.mjs

# 3. Clear cache to ensure changes are visible
node scripts/clear-product-cache.mjs

# 4. Verify everything works
node scripts/test-category-filters.mjs
```

### After Adding New Products
When you add new products that need categorization:

```bash
# Categorize new products
node scripts/fix-product-categories.mjs

# Clear cache
node scripts/clear-product-cache.mjs

# Verify
node scripts/test-category-filters.mjs
```

### After Renaming Categories
When you rename categories:

```bash
# Update slugs to match new names
node scripts/fix-category-slugs.mjs

# Clear cache
node scripts/clear-product-cache.mjs
```

## Requirements

All scripts require environment variables in `.env` or `.env.local`:

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Redis (for cache clearing)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

## Dry-Run Mode

Most scripts support `--dry-run` mode to preview changes without applying them:

```bash
node scripts/fix-category-slugs.mjs --dry-run
node scripts/fix-product-categories.mjs --dry-run
```

**Always use dry-run first** to preview what will change before applying updates!

## Troubleshooting

### Categories not showing in filters?
1. Check if category has `display: true` in database
2. Clear cache: `node scripts/clear-product-cache.mjs`
3. Verify with test: `node scripts/test-category-filters.mjs`

### Products showing in wrong category?
1. Run: `node scripts/fix-product-categories.mjs --dry-run`
2. Check if pattern matches the product name
3. If not matched, update patterns in `fix-product-categories.mjs`
4. Apply fix: `node scripts/fix-product-categories.mjs`
5. Clear cache: `node scripts/clear-product-cache.mjs`

### Filter URLs not working?
1. Check category slugs: `node scripts/fix-category-slugs.mjs --dry-run`
2. Ensure slugs are lowercase with hyphens (no spaces or special chars)
3. Apply fix if needed: `node scripts/fix-category-slugs.mjs`

## Pattern Matching Details

The `fix-product-categories.mjs` script uses regex patterns to match product names. Patterns are evaluated in order (top to bottom), and the first match wins.

**Order matters!** More specific patterns should come before generic ones:
- ✅ Check for "Jabla & Shorts Half Sleeve" BEFORE "Jabla & Shorts"
- ✅ Check for "Coords Set - Rocket Rangers" BEFORE generic "Coord Set"

To add new patterns, edit the `CATEGORY_PATTERNS` array in `fix-product-categories.mjs`.

## Notes

- Pattern matching is case-insensitive
- Slugs are automatically generated as lowercase with hyphens
- Cache clearing is non-blocking and safe to run anytime
- All scripts include detailed logging for troubleshooting
- Test suite provides comprehensive validation

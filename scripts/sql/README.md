# SQL scripts

Run in **Supabase Dashboard → SQL Editor** or via **Supabase MCP** `execute_sql` (requires `SUPABASE_ACCESS_TOKEN` and `project_id` from your project settings).

## verify-product-storage-orphans.sql

Finds product-related files in Supabase storage that are:

1. **Unused** — in `storage.objects` (bucket `media`, path `products/%`) but not referenced by any `public.product_images.url`.
2. **Duplicates** — same `(bucket_id, name)` appearing more than once in `storage.objects`.

**How to run:**

- **SQL Editor:** Open the file, run the first `SELECT` (unused), then the second `SELECT` (duplicates) in two runs.
- **MCP:** Ensure Supabase MCP has a valid access token, then call `execute_sql` with your project’s UUID and the query string (one query per call).

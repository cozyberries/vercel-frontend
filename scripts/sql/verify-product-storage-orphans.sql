-- Verify product storage: find objects that are unused or duplicated
-- Run in Supabase SQL Editor or via MCP execute_sql (project_id required).
--
-- Product images live in bucket "media" under path "products/<slug>/<n>.jpg".
-- product_images.url stores full URL: .../storage/v1/object/public/media/products/<slug>/<n>.jpg

-- 1) Referenced storage paths from public.product_images (path = bucket + '/' + object name)
--    We normalize URL by taking everything after '/object/public/'
WITH referenced AS (
  SELECT DISTINCT
    TRIM(
      SUBSTRING(
        url FROM POSITION('/object/public/' IN url) + CHAR_LENGTH('/object/public/')
      )
    ) AS storage_path
  FROM public.product_images
  WHERE url IS NOT NULL
    AND url <> ''
    AND url LIKE '%/object/public/%'
),
-- 2) All storage objects in media bucket under products/ (product folders)
storage_objects AS (
  SELECT
    o.bucket_id,
    o.name,
    (o.bucket_id || '/' || o.name) AS storage_path,
    o.created_at,
    o.id
  FROM storage.objects o
  WHERE o.bucket_id = 'media'
    AND o.name LIKE 'products/%'
)
-- 3) UNUSED: in storage but not referenced in product_images
SELECT
  'unused' AS kind,
  s.bucket_id,
  s.name AS object_path,
  s.storage_path,
  s.created_at,
  s.id AS object_id
FROM storage_objects s
LEFT JOIN referenced r ON r.storage_path = s.storage_path
WHERE r.storage_path IS NULL
ORDER BY s.name;

-- 4) DUPLICATES: same (bucket_id, name) appearing more than once in storage.objects
--    (should not happen; if it does, one copy is redundant)
SELECT
  'duplicate' AS kind,
  bucket_id,
  name AS object_path,
  COUNT(*) AS object_count,
  ARRAY_AGG(id ORDER BY created_at) AS object_ids
FROM storage.objects
WHERE bucket_id = 'media'
  AND name LIKE 'products/%'
GROUP BY bucket_id, name
HAVING COUNT(*) > 1
ORDER BY name;

-- 5) FOLDERS NOT LINKED: product slug has objects in storage but no rows in product_images
--    (folder exists under media/products/<slug>/ but no product_images.product_slug = slug)
WITH storage_slugs AS (
  SELECT DISTINCT split_part(name, '/', 2) AS slug
  FROM storage.objects
  WHERE bucket_id = 'media' AND name LIKE 'products/%'
),
linked_slugs AS (
  SELECT DISTINCT product_slug FROM public.product_images WHERE product_slug IS NOT NULL
)
SELECT s.slug AS folder_in_storage_not_linked
FROM storage_slugs s
LEFT JOIN linked_slugs l ON l.product_slug = s.slug
WHERE l.product_slug IS NULL
ORDER BY s.slug;

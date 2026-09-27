-- Two catalogue data fixes found in the 2026-09-27 audit:
-- 1. Every Girls Coord Sets product was tagged gender 'unisex'. The Boys filter
--    matches boy + unisex, so it listed the girls' bow, layered and ruffle sets.
--    They become 'girl' (the Girls filter matches girl + unisex, so they stay there).
-- 2. Category descriptions were attached to the wrong categories (Pyjamas read
--    "Unisex rompers…", Sleeveless Jablas "Beautiful frocks…"). Each of the eight
--    older categories gets a description of what it actually holds. The four frock
--    categories from 20260927120000 already have theirs.
--
-- No begin/commit on purpose: scripts/sql/test-category-data.sql loads this file
-- inside a rolled-back transaction (npm run db:test-category-data). Apply it as
-- one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260927140000_fix_category_gender_and_descriptions.sql
-- Every statement is idempotent. If any of the eight categories is missing, the
-- migration raises and nothing is changed.

update public.products
   set gender_slug = 'girl'
 where category_slug = 'girls-coord-sets'
   and gender_slug is distinct from 'girl';

update public.categories c
   set description = v.description
  from (values
    ('boys-coord-sets',              'Chinese collar shirt and shorts co-ord sets in breathable muslin'),
    ('girls-coord-sets',             'Muslin co-ord sets with bow, layered or ruffle sleeve tops'),
    ('half-sleeve-jabla-and-shorts', 'Half-sleeve jablas with front buttons and matching shorts'),
    ('newborn-essentials',           '7-piece essentials kits for newborns, sized 0-3 months'),
    ('pyjamas',                      'Full-sleeve pyjama sets with full-length pants, with or without ribbed cuffs'),
    ('rompers',                      'Muslin rompers: loose Mayra rompers for girls and half-sleeve unisex rompers'),
    ('sleeveless-jabla-and-shorts',  'Sleeveless jablas with front buttons and matching shorts'),
    ('sleeveless-jablas',            'Airy sleeveless jablas with front buttons, for 0-6 months')
  ) as v(slug, description)
 where c.slug = v.slug
   and c.description is distinct from v.description;

do $$
declare
  v_missing text;
begin
  select string_agg(want.slug, ', ' order by want.slug) into v_missing
    from (values ('boys-coord-sets'), ('girls-coord-sets'), ('half-sleeve-jabla-and-shorts'),
                 ('newborn-essentials'), ('pyjamas'), ('rompers'),
                 ('sleeveless-jabla-and-shorts'), ('sleeveless-jablas')) as want(slug)
   where not exists (select 1 from public.categories c where c.slug = want.slug);
  if v_missing is not null then
    raise exception 'CATEGORY_MISSING: %', v_missing;
  end if;
end
$$;

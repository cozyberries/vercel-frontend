-- Drop tables with zero code references across both repositories.
-- reviews/review_votes/review_images/related_products: 0 rows.
-- product_images_backup_*: 296 rows each, redundant point-in-time copies of
-- product_images, which still holds the same 296 rows.
-- Backed up to /tmp/cozyberries-backup/dead-tables-20260914.sql before running.
--
-- Note: `ratings` is deliberately NOT dropped. It is live, feeds the catalogue
-- snapshot via fetchRatingRows(), and renders star ratings on the product page.

begin;

drop table if exists public.review_votes  cascade;
drop table if exists public.review_images cascade;
drop table if exists public.reviews       cascade;
drop table if exists public.related_products cascade;
drop table if exists public.product_images_backup_pre_reindex cascade;
drop table if exists public.product_images_backup_pre_url_migration cascade;

-- DROP TABLE ... CASCADE removes dependent TRIGGERS but NOT the trigger
-- FUNCTIONS themselves (verified). These five would survive while referencing
-- tables that no longer exist. All five reference reviews/review_votes, have
-- zero code references in either repository, and their only triggers were on
-- the tables dropped above. Deleting them is better than hardening dead code,
-- and it removes five function_search_path_mutable warnings by deletion.
--
-- Despite their names, calculate_product_rating and get_product_rating_stats
-- belong to the abandoned `reviews` schema, NOT to the live `ratings` table.
-- Confirmed by reading their bodies.
drop function if exists public.update_review_helpfulness()  cascade;
drop function if exists public.update_reviews_updated_at()  cascade;
drop function if exists public.can_user_review_product(user_uuid uuid, order_uuid uuid, product_uuid uuid) cascade;
drop function if exists public.calculate_product_rating(product_uuid uuid)  cascade;
drop function if exists public.get_product_rating_stats(product_uuid uuid)  cascade;

commit;

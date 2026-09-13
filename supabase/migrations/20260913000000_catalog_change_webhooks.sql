-- Catalog change webhooks: every write to a catalog table pokes the storefront, which
-- debounces and rebuilds its Redis catalog. Async via pg_net, so writes never block.
-- Configuration lives in Vault (Dashboard → Integrations → Vault):
--   storefront_base_url      e.g. https://cozyberries.in
--   catalog_webhook_secret   same value as the storefront's CATALOG_WEBHOOK_SECRET

create extension if not exists pg_net with schema extensions;

create or replace function public.catalog_change_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  base_url text;
  secret   text;
  rec      jsonb;
  payload  jsonb;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'storefront_base_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'catalog_webhook_secret';
  if base_url is null or secret is null then
    return null; -- not configured: never block the write
  end if;

  rec := coalesce(to_jsonb(NEW), to_jsonb(OLD));
  payload := jsonb_build_object(
    'table',        TG_TABLE_NAME,
    'type',         TG_OP,
    'at',           now(),
    'id',           rec->>'id',
    'slug',         rec->>'slug',
    'old_slug',     case when TG_OP = 'UPDATE' then to_jsonb(OLD)->>'slug' end,
    'product_slug', rec->>'product_slug',
    'product_id',   rec->>'product_id'
  );

  perform net.http_post(
    url                  := rtrim(base_url, '/') || '/api/catalog/events',
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-catalog-secret', secret),
    body                 := payload,
    timeout_milliseconds := 3000
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'product_variants', 'product_images', 'product_features',
    'categories', 'sizes', 'genders', 'colors', 'ratings'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists catalog_change_%I on public.%I', t, t);
      execute format(
        'create trigger catalog_change_%I after insert or update or delete on public.%I for each row execute function public.catalog_change_notify()',
        t, t
      );
    end if;
  end loop;
end
$$;

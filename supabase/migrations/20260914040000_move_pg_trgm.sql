-- Move pg_trgm from public to extensions, where pg_net, pgcrypto, pgjwt,
-- uuid-ossp and wrappers already live. The one dependent index is rebuilt.

begin;

drop index if exists public.products_name_trgm_idx;

alter extension pg_trgm set schema extensions;

create index products_name_trgm_idx
    on public.products using gin (name extensions.gin_trgm_ops);

commit;

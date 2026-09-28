# Admin-merge cutover runbook

Ordered manual steps. Do not reorder: the webhook repoint (2) must land after the
deploy (1), and the deletions (5–7) only after verification (4).

## 1. Deploy + env
- [ ] Merge the feature branch to `develop` and `main`, push (per repo convention).
- [ ] Vercel (storefront project) → Settings → Environment Variables, add for
      Production: `DELHIVERY_WAREHOUSE_NAME` (copy value from the admin Vercel
      project), `DELHIVERY_WEBHOOK_TOKEN` (copy), `INTERNAL_JOB_TOKEN` (copy, or
      mint 32+ random bytes: `openssl rand -hex 32`).
- [ ] Redeploy and confirm `https://cozyberries.in/admin/orders` loads for an admin.
- [ ] Apply `supabase/migrations/20260928100000_delhivery_webhook_pipeline.sql` via the
      Supabase Dashboard SQL editor (runs as `postgres`). It is idempotent.
- [ ] Pre-check: `select distinct type from public.notifications;` — every value must be
      in (info,success,warning,error,order_status,payment_status,shipping_scan), or the
      type-check re-add in the migration will fail.

## 2. Repoint the pipeline
- [ ] Delhivery dashboard (or account manager): change the scan-webhook URL to
      `https://cozyberries.in/api/webhooks/delhivery` (same `x-delhivery-token`).
- [ ] Run `npm run qstash:schedule-delhivery` with prod env
      (`QSTASH_URL`, `QSTASH_TOKEN` from Vercel) — upserts the schedule to the new URL.
- [ ] Delete the old QStash schedule if the id differs (Upstash console → QStash →
      Schedules).

## 3. Drain the old queue
- [ ] Trigger the OLD admin processor once more (or wait for its last schedule) so
      no pending `webhook_events` rows are stranded mid-lease, then disable the old
      schedule.

## 4. Verify end-to-end
- [ ] `curl -X POST https://cozyberries.in/api/webhooks/delhivery \
        -H "x-delhivery-token: $DELHIVERY_WEBHOOK_TOKEN" -H "content-type: application/json" \
        -d '{"AWB":"TEST-CUTOVER","Status":"In Transit","StatusDateTime":"2026-09-28T12:00:00+05:30"}'`
      → expect `202 {"ok":true}`.
- [ ] Trigger the processor manually (internal HMAC):
      `TS=$(date +%s000); SIG=$(printf "%s:/api/internal/webhooks/delhivery/process" "$TS" | \
        openssl dgst -sha256 -hmac "$INTERNAL_JOB_TOKEN" -hex | awk '{print $2}'); \
        curl -X POST https://cozyberries.in/api/internal/webhooks/delhivery/process \
        -H "x-internal-job-token: $INTERNAL_JOB_TOKEN" -H "x-job-ts: $TS" -H "x-job-sig: $SIG"`
      → expect `{"ok":true,"result":{...}}` with `processed >= 1`.
- [ ] Open `/admin/orders` → the Scans panel shows "Shipment scan: In Transit — AWB
      TEST-CUTOVER". Mark it read.
- [ ] Create one real shipment from `/admin/orders` on a paid delivery order; print its
      label; cancel it if it was a test.

## 5. Drop the old login table
- [ ] Pre-check dependents: `select * from pg_depend d join pg_class c on d.refobjid = c.oid
      where c.relname = 'admin_users';` — review anything unexpected before the CASCADE drop.
- [ ] Apply `supabase/migrations/20260928110000_drop_admin_users.sql` in the SQL editor.
- [ ] Run `npm run db:lint` (expect ERROR=0) and `npm run db:probe`.

## 6. Delete the admin deployment
- [ ] Vercel: delete project `prj_jb2I2WJeK5whNkcKN6ooEU9rL6xO` (cozyberries-admin).
- [ ] DNS: remove the `admin.cozyberries.com` record.

## 7. Delete the admin repo
- [ ] Safety net: `cd ../cozyberries-admin && git bundle create ../cozyberries-admin-final.bundle --all`
- [ ] Delete the GitHub repo (Settings → Danger Zone) using the cozyberries account.
- [ ] `rm -rf ../cozyberries-admin`
- [ ] Update Claude memory: mark the merge done; retire admin-repo references.
- [ ] Follow-up: remove /api/auth/generate-token + lib/jwt-auth.ts and the JWT_SECRET env var once nothing has needed them for a couple of weeks.

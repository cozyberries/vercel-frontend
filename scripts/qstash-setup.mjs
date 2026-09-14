#!/usr/bin/env node
// Creates (or recreates) the nightly full-rebuild schedule. Idempotent: existing schedules
// pointing at our rebuild URL are deleted first. Requires QSTASH_TOKEN and CATALOG_BASE_URL.
import { config } from "dotenv";
import { Client } from "@upstash/qstash";

config({ path: ".env.local" });

const token = process.env.QSTASH_TOKEN;
const base = (process.env.CATALOG_BASE_URL ?? "").replace(/\/$/, "");
if (!token || !base) {
  console.error("QSTASH_TOKEN and CATALOG_BASE_URL are required");
  process.exit(1);
}

const client = new Client({ token });
// `schedules` is a method in current SDK versions and a property in older ones.
const schedules = typeof client.schedules === "function" ? client.schedules() : client.schedules;
const destination = `${base}/api/catalog/rebuild`;

const existing = (await schedules.list()).filter((s) => s.destination === destination);
for (const schedule of existing) {
  await schedules.delete(schedule.scheduleId);
  console.log("deleted", schedule.scheduleId);
}

const created = await schedules.create({
  destination,
  cron: "0 21 * * *", // 02:30 IST
  body: JSON.stringify({ kind: "full" }),
  headers: { "Content-Type": "application/json" },
  retries: 3,
  failureCallback: `${base}/api/catalog/rebuild-failed`,
});
console.log("created", created.scheduleId, "→", destination, "@ 0 21 * * * (UTC)");

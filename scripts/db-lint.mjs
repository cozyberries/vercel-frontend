#!/usr/bin/env node
// Runs Supabase's splinter linter and fails the build on ERROR-level findings.
// Usage: node scripts/db-lint.mjs [--url=<postgres-url>]
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

function connectionString() {
  const flag = process.argv.find((a) => a.startsWith("--url="));
  if (flag) return flag.slice("--url=".length);
  if (process.env.POSTGRES_URL_NON_POOLING) return process.env.POSTGRES_URL_NON_POOLING;
  if (existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith("POSTGRES_URL_NON_POOLING="));
    if (line) return line.slice("POSTGRES_URL_NON_POOLING=".length).replace(/^["']|["']$/g, "");
  }
  throw new Error("No connection string. Set POSTGRES_URL_NON_POOLING or pass --url=");
}

const out = execFileSync(
  "psql",
  [connectionString(), "-At", "-F", "\t", "-f", "scripts/sql/lint.sql"],
  { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "15" } }
);

const findings = out
  .split("\n")
  .map((l) => l.split("\t"))
  .filter((c) => c.length > 6 && ["ERROR", "WARN", "INFO"].includes(c[2]))
  .map((c) => ({ name: c[0], level: c[2], detail: c[6] }));

const counts = findings.reduce((a, f) => ((a[f.level] = (a[f.level] || 0) + 1), a), {});
console.log(`ERROR=${counts.ERROR || 0}  WARN=${counts.WARN || 0}  INFO=${counts.INFO || 0}`);

for (const level of ["ERROR", "WARN"]) {
  for (const f of findings.filter((x) => x.level === level)) {
    console.log(`  [${level}] ${f.name}: ${String(f.detail).slice(0, 160)}`);
  }
}

if (counts.ERROR) {
  console.error(`\nFAIL: ${counts.ERROR} ERROR-level finding(s).`);
  process.exit(1);
}
console.log("\nOK: no ERROR-level findings.");

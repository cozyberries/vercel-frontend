#!/usr/bin/env node
// Runs the security probe. Exits non-zero if any assertion fails.
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
  [connectionString(), "-At", "-f", "scripts/sql/security-probe.sql"],
  { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "15" } }
);

const lines = out.split("\n").filter((l) => l.startsWith("PASS ") || l.startsWith("FAIL "));
lines.forEach((l) => console.log("  " + l));

const failed = lines.filter((l) => l.startsWith("FAIL "));
console.log(`\n${lines.length - failed.length}/${lines.length} assertions passed.`);
if (failed.length) process.exit(1);

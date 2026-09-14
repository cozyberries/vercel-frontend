#!/usr/bin/env node
// Runs the security probe. Exits non-zero if any assertion fails.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

function connectionString() {
  const flag = process.argv.find((a) => a.startsWith("--url="));
  if (flag) return flag.slice("--url=".length);
  if (process.env.POSTGRES_URL_NON_POOLING) return process.env.POSTGRES_URL_NON_POOLING.trim();
  if (existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith("POSTGRES_URL_NON_POOLING="));
    if (line) {
      return line
        .slice("POSTGRES_URL_NON_POOLING=".length)
        .replace(/^["']|["']$/g, "")
        .trim();
    }
  }
  throw new Error("No connection string. Set POSTGRES_URL_NON_POOLING or pass --url=");
}

const connString = connectionString();

let out;
try {
  out = execFileSync(
    "psql",
    [connString, "-At", "-f", "scripts/sql/security-probe.sql"],
    {
      encoding: "utf8",
      env: { ...process.env, PGCONNECT_TIMEOUT: "15" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
} catch (err) {
  // Never print `err`, err.message, err.cmd, or err.stack here: execFileSync's
  // thrown Error embeds the full argv — including the plaintext connection
  // string and its password — in those fields. Only a redacted summary, plus
  // psql's own stderr with any accidental copy of the connection string
  // scrubbed out, is safe to surface. (`stdio: ["ignore", "pipe", "pipe"]`
  // below is also required: Node's default stdio inherits the child's
  // stderr live to our own stderr as it's written, which would leak before
  // this catch block — and its redaction — ever runs.)
  const code = typeof err.status === "number" ? err.status : "unknown";
  console.error(`psql failed (exit ${code}). Connection string redacted.`);
  const stderr = typeof err.stderr === "string" ? err.stderr : "";
  if (stderr) {
    console.error(stderr.split(connString).join("[REDACTED]"));
  }
  process.exit(1);
}

const EXPECTED_ASSERTIONS = 11;
const lines = out.split("\n").filter((l) => l.startsWith("PASS ") || l.startsWith("FAIL "));
lines.forEach((l) => console.log("  " + l));

if (lines.length < EXPECTED_ASSERTIONS) {
  console.error(
    `\nFAIL: parsed only ${lines.length} assertion line(s), expected ${EXPECTED_ASSERTIONS}. ` +
      "The probe's output shape likely changed — treating this as a failure rather than a clean pass."
  );
  process.exit(1);
}

const failed = lines.filter((l) => l.startsWith("FAIL "));
console.log(`\n${lines.length - failed.length}/${lines.length} assertions passed.`);
if (failed.length) process.exit(1);

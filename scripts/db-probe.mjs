#!/usr/bin/env node
// Runs the security probe. Exits non-zero if any assertion fails.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/security-probe.sql", expected: 13 });

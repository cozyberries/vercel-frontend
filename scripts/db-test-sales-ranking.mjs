#!/usr/bin/env node
// Behavioural tests for the product sales ranking migration. The SQL loads the
// migration inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-sales-ranking.sql", expected: 11 });

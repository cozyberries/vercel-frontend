#!/usr/bin/env node
// Behavioural tests for the GST sales register migration. The SQL loads the
// migration inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-sales-register.sql", expected: 15 });

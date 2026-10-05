#!/usr/bin/env node
// Behavioural tests for the order-price-overrides migration. The SQL loads the
// migration inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-order-price-overrides.sql", expected: 15 });

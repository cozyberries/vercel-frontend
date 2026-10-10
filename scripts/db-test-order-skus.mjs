#!/usr/bin/env node
// Behavioural tests for the order line sku backfill. The SQL loads the migration
// inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-backfill-order-skus.sql", expected: 9 });

#!/usr/bin/env node
// Checks that a customer's own session can place an order and record a
// payment claim. The SQL loads the fix inside a transaction and rolls back.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-order-references.sql", expected: 3 });

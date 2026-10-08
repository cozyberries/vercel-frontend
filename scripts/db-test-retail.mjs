#!/usr/bin/env node
// Behavioural tests for the retail consignment migrations. The SQL loads the
// migrations inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-retail.sql", expected: 32 });

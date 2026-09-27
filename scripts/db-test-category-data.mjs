#!/usr/bin/env node
// Behavioural tests for the category gender + description fix. The SQL loads the
// migration inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-category-data.sql", expected: 6 });

#!/usr/bin/env node
// Behavioural tests for the frock category rename. The SQL loads the migration inside a
// transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-rename-frock-categories.sql", expected: 11 });

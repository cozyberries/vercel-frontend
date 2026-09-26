#!/usr/bin/env node
// Post-build guard: the /bill PDF route must ship pdfkit's built-in fonts.
//
// @react-pdf/renderer draws with pdfkit, which loads its standard fonts through
// package subpath imports (`require('#standard-fonts/Helvetica')`). Next's
// output file tracing cannot follow those, so without the explicit
// `outputFileTracingIncludes` entry in next.config.mjs the fonts are missing
// from the Vercel function and every bill link 500s with
// "Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs".
// Runs as `postbuild`, so a regression fails the build instead of production.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TRACE = ".next/server/app/bill/[orderId]/[sig]/route.js.nft.json";
const REQUIRED = ["Helvetica.cjs", "HelveticaBold.cjs"];

if (!existsSync(TRACE)) {
  console.error(`check-bill-trace: ${TRACE} not found — did the build emit the /bill route?`);
  process.exit(1);
}

const { files } = JSON.parse(readFileSync(TRACE, "utf8"));
const traced = new Set(files.map((f) => resolve(".next/server/app/bill/[orderId]/[sig]", f)));
const missing = REQUIRED.filter(
  (font) => ![...traced].some((f) => f.endsWith(`/pdfkit/js/standard-fonts/${font}`))
);

if (missing.length) {
  console.error(`check-bill-trace: /bill route bundle is missing pdfkit fonts: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`check-bill-trace: /bill route bundle includes ${REQUIRED.join(", ")}`);

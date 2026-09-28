// V2-only test runner. Executes every *.js file directly under tests/v2/
// (excluding this file and *.spec.js browser specs) with `node`, isolated
// from the V1 regression suite in tests/*.js and V1 CI.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = __dirname;
const self = path.basename(__filename);

const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".js"))
  .filter((name) => name !== self)
  .filter((name) => !name.endsWith(".spec.js"))
  .sort();

if (files.length === 0) {
  console.log("No V2 tests yet under tests/v2/. Nothing to run.");
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const fullPath = path.join(dir, file);
  const result = spawnSync(process.execPath, [fullPath], { stdio: "inherit" });
  if (result.status === 0) {
    console.log(`PASS tests/v2/${file}`);
  } else {
    failed += 1;
    console.log(`FAIL tests/v2/${file}`);
  }
}

console.log(`\nV2 tests: ${files.length - failed}/${files.length} passed`);
process.exit(failed === 0 ? 0 : 1);

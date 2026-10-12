// V2-only test runner. Executes every *.js file directly under tests/v2/
// (excluding this file and *.spec.js browser specs) with `node`, isolated
// from the V1 regression suite in tests/*.js and V1 CI.
//
// The files run in parallel, V2_JOBS at a time (default: the machine's
// available parallelism, at most 4; V2_JOBS=1 runs them one by one). Each
// file is still its own process, so they share nothing; each file's output is
// held until it ends and printed whole, in file order, then its PASS/FAIL line.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

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

const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const jobs = Math.max(1, Number.parseInt(process.env.V2_JOBS ?? "", 10) || Math.min(4, cpus));

function runOne(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, file)], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));
    child.on("error", (err) => resolve({ code: 1, output: Buffer.from(String(err.stack ?? err)) }));
    child.on("close", (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), output: Buffer.concat(chunks) }));
  });
}

async function main() {
  const results = new Array(files.length);
  let next = 0;
  let printed = 0;
  let failed = 0;
  // print finished files in file order as soon as everything before them is done
  const flush = () => {
    while (printed < files.length && results[printed]) {
      const { code, output } = results[printed];
      if (output.length) process.stdout.write(output);
      if (code === 0) {
        console.log(`PASS tests/v2/${files[printed]}`);
      } else {
        failed += 1;
        console.log(`FAIL tests/v2/${files[printed]}`);
      }
      printed += 1;
    }
  };
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      results[i] = await runOne(files[i]);
      flush();
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
  flush();
  console.log(`\nV2 tests: ${files.length - failed}/${files.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();

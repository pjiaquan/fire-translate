import { spawnSync } from "node:child_process";

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Usage: node scripts/lint-firefox.mjs <unpacked-package-directory>");
const result = spawnSync("npx", ["--yes", "web-ext@10.7.0", "lint", "--source-dir", sourceDir, "--output", "json"], { encoding: "utf8" });
if (result.error) throw result.error;
if (result.stderr) process.stderr.write(result.stderr);
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error(`Firefox validator did not return JSON (exit ${result.status}).`);
}
const unsafe = report.warnings.filter(warning => warning.code === "UNSAFE_VAR_ASSIGNMENT");
console.log(JSON.stringify({ sourceDir, summary: report.summary, warningCodes: [...new Set(report.warnings.map(warning => warning.code))] }, null, 2));
if (result.status !== 0 || report.summary.errors || unsafe.length) {
  console.error(JSON.stringify({ errors: report.errors, unsafeAssignments: unsafe }, null, 2));
  process.exit(1);
}

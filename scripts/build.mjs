import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const outputDir = resolve(root, "dist");
const output = resolve(outputDir, `fire-translate-v${packageJson.version}.zip`);
const files = [
  "manifest.json", "background.js", "content.js", "shared.js",
  "popup.html", "popup.css", "popup.js", "icons",
  "PRIVACY_POLICY.md", "README.md"
];

mkdirSync(outputDir, { recursive: true });
rmSync(output, { force: true });
execFileSync("zip", ["-r", output, ...files], { cwd: root, stdio: "inherit" });
console.log(`Built ${output}`);

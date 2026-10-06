import { mkdirSync, rmSync, readFileSync, mkdtempSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createBrowserManifest, createBrowserScript } from "./browser-manifest.mjs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const outputDir = resolve(root, "dist");
const browser = process.argv.includes("--firefox") ? "firefox" : "chrome";
const output = resolve(outputDir, `fire-translate${browser === "firefox" ? "-firefox" : ""}-v${packageJson.version}.zip`);
const files = [
  "manifest.json", "background.js", "content.js", "shared.js",
  "popup.html", "popup.css", "popup.js", "surface.js", "ui.js", "icons",
  "PRIVACY_POLICY.md", "README.md"
];

mkdirSync(outputDir, { recursive: true });
rmSync(output, { force: true });
const staging = mkdtempSync(resolve(tmpdir(), "fire-translate-build-"));
try {
  for (const file of files) cpSync(resolve(root, file), resolve(staging, file), { recursive: true });
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  writeFileSync(resolve(staging, "manifest.json"), `${JSON.stringify(createBrowserManifest(manifest, browser), null, 2)}\n`);
  for (const file of ["background.js", "popup.js"]) {
    writeFileSync(resolve(staging, file), createBrowserScript(readFileSync(resolve(root, file), "utf8"), browser));
  }
  execFileSync("zip", ["-r", output, ...files], { cwd: staging, stdio: "inherit" });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
console.log(`Built ${output}`);

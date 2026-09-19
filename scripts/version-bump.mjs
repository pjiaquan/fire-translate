import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const increment = process.argv[2];
if (!["patch", "minor", "major"].includes(increment)) {
  console.error("Usage: npm run version:bump -- patch|minor|major");
  process.exit(1);
}

const packagePath = resolve(root, "package.json");
const manifestPath = resolve(root, "manifest.json");
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const parts = packageJson.version.split(".").map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`Invalid version: ${packageJson.version}`);

if (increment === "major") [parts[0], parts[1], parts[2]] = [parts[0] + 1, 0, 0];
if (increment === "minor") [parts[1], parts[2]] = [parts[1] + 1, 0];
if (increment === "patch") parts[2] += 1;

const version = parts.join(".");
packageJson.version = version;
manifest.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Version bumped to ${version}`);

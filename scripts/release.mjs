import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const increment = process.argv.find((arg) => ["patch", "minor", "major"].includes(arg));
const shouldPush = process.argv.includes("--push");
const remote = process.env.RELEASE_REMOTE || "github";
if (!increment) {
  console.error("Usage: npm run release -- patch|minor|major [--push]");
  process.exit(1);
}

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });
if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("Working tree must be clean before releasing.");
}

run("node", ["scripts/version-bump.mjs", increment]);
run("npm", ["test"]);
run("npm", ["run", "build"]);

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tag = `v${packageJson.version}`;
const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
run("git", ["add", "package.json", "manifest.json"]);
run("git", ["commit", "-m", `release: ${tag}`]);
run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);

if (shouldPush) {
  if (!branch) throw new Error("Cannot push a detached HEAD");
  run("git", ["push", remote, branch, "--follow-tags"]);
  console.log(`Published ${tag} via ${remote}; GitHub Actions will deploy it to Chrome Web Store.`);
} else {
  console.log(`Created ${tag}. Run with --push to push the commit and tag.`);
}

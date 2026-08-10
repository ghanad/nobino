import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, ".test-build");
const testDbPath = path.join(buildDir, "business-rules.sqlite");
const env = {
  ...process.env,
  DATABASE_URL: "file:../.test-build/business-rules.sqlite",
  NODE_ENV: "test",
  TZ: process.env.TZ || "Asia/Tehran",
};

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
}

rmSync(buildDir, { force: true, recursive: true });
mkdirSync(buildDir, { recursive: true });
writeFileSync(testDbPath, "", "utf8");

run("npx", ["tsc", "-p", "tests/tsconfig.business.json"]);

const nodeModulesDir = path.join(buildDir, "node_modules");
const scopedAliasDir = path.join(nodeModulesDir, "@");
const serverOnlyDir = path.join(nodeModulesDir, "server-only");

mkdirSync(scopedAliasDir, { recursive: true });
mkdirSync(serverOnlyDir, { recursive: true });
writeFileSync(path.join(serverOnlyDir, "index.js"), "", "utf8");

const libAliasPath = path.join(scopedAliasDir, "lib");
if (!existsSync(libAliasPath)) {
  symlinkSync("../../lib", libAliasPath, "dir");
}

const componentsAliasPath = path.join(scopedAliasDir, "components");
if (!existsSync(componentsAliasPath)) {
  symlinkSync("../../components", componentsAliasPath, "dir");
}

run("npx", ["prisma", "db", "push", "--skip-generate"]);
run(process.execPath, [
  "--test",
  path.join(buildDir, "tests/business-rules.test.js"),
  path.join(buildDir, "tests/lunch-building-selection.test.js"),
  path.join(buildDir, "tests/manager-weekly-calendar-helpers.test.js"),
]);

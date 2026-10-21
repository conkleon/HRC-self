/**
 * PostToolUse hook: formats the one file an Edit/Write/MultiEdit just changed.
 *
 * Claude Code passes the tool call as JSON on stdin; the file is
 * `tool_input.file_path`. Hooks get no FILE_PATH environment variable, so
 * reading the path any other way leaves Prettier with an empty argument, and
 * Prettier then formats the whole repository.
 *
 * Uses the workspace's own Prettier (node_modules/.bin), so formatting matches
 * `pnpm run format`. Files Prettier cannot parse are skipped
 * (`--ignore-unknown`), and `.prettierignore` is honoured. Never fails the
 * tool call: a formatting problem is reported on stderr and the hook exits 0.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let input = "";
for await (const chunk of process.stdin) input += chunk;

let filePath;
try {
  filePath = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}

if (typeof filePath !== "string" || filePath.trim() === "") process.exit(0);

const absolute = path.resolve(projectDir, filePath);
const relative = path.relative(projectDir, absolute);

// Only files inside this repository, never a directory or a missing path.
if (
  relative.startsWith("..") ||
  path.isAbsolute(relative) ||
  !existsSync(absolute)
) {
  process.exit(0);
}

const bin = path.join(
  projectDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prettier.cmd" : "prettier"
);
if (!existsSync(bin)) process.exit(0);

const result = spawnSync(bin, ["--write", "--ignore-unknown", absolute], {
  cwd: projectDir,
  stdio: ["ignore", "ignore", "pipe"],
  shell: process.platform === "win32",
});

if (result.status !== 0 && result.stderr?.length) {
  process.stderr.write(result.stderr);
}
process.exit(0);

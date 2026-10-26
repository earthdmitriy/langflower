// git-diff.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineNode } from "file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/vendor/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js";
var execFileAsync = promisify(execFile);
var EXCLUDED_DIRS = [".langflower", "demo-project"];
var MAX_BUFFER = 2 * 1024 * 1024;
function headerTargetsExcludedDir(headerLine) {
  return EXCLUDED_DIRS.some(
    (dir) => headerLine.startsWith(`diff --git a/${dir}/`) || headerLine.includes(` b/${dir}/`)
  );
}
function dropExcludedSections(patch) {
  const lines = patch.split("\n");
  const kept = [];
  let dropping = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      dropping = headerTargetsExcludedDir(line);
    }
    if (!dropping) kept.push(line);
  }
  return kept.join("\n");
}
function joinPatches(chunks) {
  return chunks.filter((chunk) => chunk.length > 0).map((chunk) => chunk.endsWith("\n") ? chunk : `${chunk}
`).join("");
}
async function readPatch(projectDir, pathspecs) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "HEAD", "--", ...pathspecs],
      { cwd: projectDir, maxBuffer: MAX_BUFFER }
    );
    return String(stdout);
  } catch (headError) {
    try {
      const [staged, unstaged] = await Promise.all([
        execFileAsync("git", ["diff", "--cached", "--", ...pathspecs], {
          cwd: projectDir,
          maxBuffer: MAX_BUFFER
        }),
        execFileAsync("git", ["diff", "--", ...pathspecs], {
          cwd: projectDir,
          maxBuffer: MAX_BUFFER
        })
      ]);
      return joinPatches([String(staged.stdout), String(unstaged.stdout)]);
    } catch {
      throw headError;
    }
  }
}
var git_diff_default = defineNode({
  type: "my-git-diff",
  displayName: "Git Diff",
  category: "Text",
  description: "Runs `git diff HEAD` and emits the patch text for staged and unstaged changes, excluding `.langflower` and `demo-project`.",
  uiSchema: [],
  inputs: {
    trigger: {
      wireType: "any",
      required: true,
      dynamic: true,
      description: "Emit to run `git diff HEAD`."
    }
  },
  outputs: {
    diff: {
      wireType: "string",
      description: "Patch text for staged and unstaged changes (empty string if clean). Untracked files are not included. `.langflower` and `demo-project` are excluded."
    }
  },
  async execute(ctx) {
    const projectDir = String(ctx.projectDir ?? "");
    if (projectDir.length === 0) {
      throw new Error("Git Diff requires ctx.projectDir.");
    }
    const pathspecs = [
      ".",
      ...EXCLUDED_DIRS.map((dir) => `:(exclude)${dir}`)
    ];
    const patch = await readPatch(projectDir, pathspecs);
    return { diff: dropExcludedSections(patch) };
  }
});
export {
  git_diff_default as default
};

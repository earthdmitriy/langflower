// git-diff-tool.ts
import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { defineToolRegistrations } from "file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/vendor/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js";
var execFileAsync = promisify(execFile);
var MAX_BUFFER = 2 * 1024 * 1024;
var EXCLUDED_DIRS = [".langflower", "demo-project"];
var MODES = ["patch", "dirs", "files", "file"];
function isExcludedPath(relativePath) {
  return EXCLUDED_DIRS.some(
    (dir) => relativePath === dir || relativePath.startsWith(`${dir}/`)
  );
}
function headerTargetsExcludedDir(headerLine) {
  return EXCLUDED_DIRS.some(
    (dir) => headerLine.startsWith(`diff --git a/${dir}/`) || headerLine.includes(` b/${dir}/`)
  );
}
function dropExcludedSections(patch) {
  const kept = [];
  let dropping = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      dropping = headerTargetsExcludedDir(line);
    }
    if (!dropping) kept.push(line);
  }
  return kept.join("\n");
}
var EXCLUDES = EXCLUDED_DIRS.map((dir) => `:(exclude)${dir}`);
function scopePathspec(raw, options = {}) {
  const trimmed = raw.trim();
  const requireFile = options.requireFile === true;
  if (trimmed.length === 0) {
    if (requireFile) {
      return { ok: false, reason: "mode `file` requires `path` to name a file" };
    }
    return { ok: true, pathspec: "." };
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || isAbsolute(trimmed)) {
    return { ok: false, reason: "path must be relative to the project root" };
  }
  if (/^[A-Za-z]:/.test(trimmed)) {
    return { ok: false, reason: "path must be relative to the project root" };
  }
  if (requireFile && /[\\/]$/.test(trimmed)) {
    return { ok: false, reason: "path must name a file, not a directory" };
  }
  const segments = trimmed.split(/[\\/]+/).filter((s) => s.length > 0 && s !== ".");
  if (segments.some((segment) => segment === "..")) {
    return { ok: false, reason: "path must not contain `..`" };
  }
  if (segments.length === 0) {
    if (requireFile) {
      return { ok: false, reason: "path must name a single file" };
    }
    return { ok: true, pathspec: "." };
  }
  if (EXCLUDED_DIRS.some((dir) => segments[0] === dir)) {
    return {
      ok: false,
      reason: `path is inside an excluded folder (${EXCLUDED_DIRS.join(", ")}); those are never diffed`
    };
  }
  return { ok: true, pathspec: segments.join("/") };
}
var REGEX_SPECIALS = /* @__PURE__ */ new Set([
  "\\",
  "^",
  "$",
  ".",
  "|",
  "+",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}"
]);
function maskToRegExp(mask) {
  let pattern = "";
  for (let i = 0; i < mask.length; i += 1) {
    const char = mask[i];
    if (char === "*") {
      if (mask[i + 1] === "*") {
        i += 1;
        if (mask[i + 1] === "/") {
          i += 1;
          pattern += "(?:[^/]+/)*";
        } else {
          pattern += ".*";
        }
      } else {
        pattern += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      pattern += "[^/]";
      continue;
    }
    pattern += REGEX_SPECIALS.has(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${pattern}$`);
}
function basenameOf(relativePath) {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? relativePath : relativePath.slice(index + 1);
}
function compileMask(raw) {
  const mask = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (mask.length === 0) return { ok: true, predicate: () => true };
  if (mask.startsWith("/")) {
    return { ok: false, reason: "mask must be relative to the project root" };
  }
  if (/^[A-Za-z]:/.test(mask)) {
    return { ok: false, reason: "mask must be relative to the project root" };
  }
  if (mask.split("/").some((segment) => segment === "..")) {
    return { ok: false, reason: "mask must not contain `..`" };
  }
  const re = maskToRegExp(mask);
  const basenameOnly = !mask.includes("/");
  return {
    ok: true,
    predicate: (relativePath) => re.test(basenameOnly ? basenameOf(relativePath) : relativePath)
  };
}
async function gitStdout(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: MAX_BUFFER
  });
  return String(stdout);
}
function splitNul(text) {
  return text.split("\0").filter((entry) => entry.length > 0);
}
function joinPatches(chunks) {
  return chunks.filter((chunk) => chunk.length > 0).map((chunk) => chunk.endsWith("\n") ? chunk : `${chunk}
`).join("");
}
async function readPatch(projectDir, pathspecs) {
  try {
    return await gitStdout(projectDir, ["diff", "HEAD", "--", ...pathspecs]);
  } catch (headError) {
    try {
      const [staged, unstaged] = await Promise.all([
        gitStdout(projectDir, ["diff", "--cached", "--", ...pathspecs]),
        gitStdout(projectDir, ["diff", "--", ...pathspecs])
      ]);
      return joinPatches([staged, unstaged]);
    } catch {
      throw headError;
    }
  }
}
async function readChangedFiles(projectDir, pathspecs) {
  let tracked;
  try {
    tracked = splitNul(
      await gitStdout(projectDir, [
        "diff",
        "HEAD",
        "--name-only",
        "-z",
        "--",
        ...pathspecs
      ])
    );
  } catch {
    const [staged, unstaged] = await Promise.all([
      gitStdout(projectDir, [
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--",
        ...pathspecs
      ]),
      gitStdout(projectDir, [
        "diff",
        "--name-only",
        "-z",
        "--",
        ...pathspecs
      ])
    ]);
    tracked = [...splitNul(staged), ...splitNul(unstaged)];
  }
  const untracked = splitNul(
    await gitStdout(projectDir, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ...pathspecs
    ])
  );
  const unique = /* @__PURE__ */ new Set();
  for (const relativePath of [...tracked, ...untracked]) {
    if (!isExcludedPath(relativePath)) unique.add(relativePath);
  }
  return [...unique].sort();
}
function directoriesOf(files) {
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    const index = file.lastIndexOf("/");
    dirs.add(index === -1 ? "." : file.slice(0, index));
  }
  return [...dirs].sort();
}
var git_diff_tool_default = defineToolRegistrations({
  type: "my-git-diff-tool",
  displayName: "Git Diff Tool",
  category: "Text",
  description: "Emits a `git_diff` ToolHandle for agent inventory \u2014 runs `git diff HEAD` in the project directory on demand. Modes: `patch` (default, staged + unstaged patch), `dirs` (immediate parent folder of each changed file, nesting not collapsed), `files` (changed file list \u2014 both listing modes take an optional glob `mask` and include untracked), `file` (patch of one file). `.langflower` and `demo-project` are always excluded, before `path` / `mask`.",
  tools: [
    {
      toolId: "git_diff",
      name: "git_diff",
      description: 'Git changes in the Langflower project directory, staged and unstaged included (everything that differs from the last commit). `mode` selects the view \u2014 `patch` (default) returns the patch text; `dirs` returns only the directories that *directly* contain a changed file (not collapsed: a change in `a/b/c/x.ts` reports `a/b/c`, never `a`; `.` for files at the project root); `files` returns changed file paths (both listing modes also include untracked files and accept a glob `mask`); `file` returns the patch of the single file named by `path`. `path` (relative, must stay inside the project) scopes any mode. `.langflower` and `demo-project` are excluded *before* `path` / `mask` are applied, so a `mask` aimed at those folders (e.g. `.langflower/**/*.ts`) always answers "no changed files matching \u2026" even when they are dirty \u2014 that is NOT evidence of a clean tree; drop the mask to see the real inventory. Without such a mask, "no changes" means a clean working tree.',
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: [...MODES],
            description: "`patch` (default) full patch; `dirs` changed directories, each one the immediate parent of at least one changed file (nesting is not collapsed, so deep paths come back as-is); `files` changed files; `file` patch of one file named by `path`."
          },
          path: {
            type: "string",
            description: "Optional project-relative path to scope `git diff -- <path>`. Required for mode `file` (must name a file). Must not be absolute, must not contain `..`, and must not be inside `.langflower` or `demo-project`."
          },
          mask: {
            type: "string",
            description: "Glob mask for modes `dirs` / `files`, e.g. `*.md`, `src/**`, `docs/**/*.ts`. A mask without `/` matches the basename only (`*.md` finds `docs/a.md`); with `/` it is anchored to the project root; `*` stays inside one path segment, `**` crosses slashes (`**/` also matches zero segments). Applied *after* the built-in `.langflower` / `demo-project` exclusion, so a mask can never re-include them \u2014 `no changed files matching \u2026` for such a mask does not mean the tree is clean. Ignored by `patch` and `file`."
          }
        },
        additionalProperties: false
      },
      handler: async (args, ctx) => {
        const projectDir = String(ctx.projectDir ?? "");
        if (projectDir.length === 0) {
          throw new Error("git_diff requires ctx.projectDir.");
        }
        const rawMode = typeof args.mode === "string" ? args.mode.trim() : "";
        if (rawMode.length > 0 && !MODES.includes(rawMode)) {
          return `git_diff: unknown mode "${rawMode}"; use one of ${MODES.join(", ")}.`;
        }
        const mode = rawMode.length === 0 ? "patch" : rawMode;
        const rawPath = typeof args.path === "string" ? args.path : "";
        const scope = scopePathspec(rawPath, { requireFile: mode === "file" });
        if (!scope.ok) return `git_diff: ${scope.reason}.`;
        const pathspecs = [scope.pathspec, ...EXCLUDES];
        try {
          if (mode === "file") {
            const patch = dropExcludedSections(
              await readPatch(projectDir, pathspecs)
            );
            if (patch.trim().length === 0) {
              return `git_diff: no tracked changes in ${scope.pathspec} (untracked files never appear in a patch).`;
            }
            return patch;
          }
          if (mode === "dirs" || mode === "files") {
            const rawMask = typeof args.mask === "string" ? args.mask : "";
            const mask = compileMask(rawMask);
            if (!mask.ok) return `git_diff: ${mask.reason}.`;
            const changed = await readChangedFiles(projectDir, pathspecs);
            const filtered = changed.filter(mask.predicate);
            const maskLabel = rawMask.trim().length > 0 ? ` matching \`${rawMask.trim()}\`` : "";
            if (mode === "files") {
              if (filtered.length === 0) {
                return `git_diff: no changed files${maskLabel}.`;
              }
              return filtered.join("\n");
            }
            const dirs = directoriesOf(filtered);
            if (dirs.length === 0) {
              return `git_diff: no changed directories${maskLabel}.`;
            }
            return dirs.join("\n");
          }
          return dropExcludedSections(
            await readPatch(projectDir, pathspecs)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`git_diff failed: ${message}`);
        }
      }
    }
  ]
});
export {
  git_diff_tool_default as default
};

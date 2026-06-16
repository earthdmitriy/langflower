#!/usr/bin/env node
/**
 * Cross-platform agent entrypoint (no bash required).
 *
 * Usage:
 *   node build/tools/agent-run.mjs build-all
 *   node build/tools/agent-run.mjs build-package shared
 *   node build/tools/agent-run.mjs help
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(BUILD_DIR, '..');

const COMMANDS = {
	'build-all': 'build-all.mjs',
	'build-shared': 'build-shared.mjs',
	'build-server': 'build-server.mjs',
	'build-ui': 'build-ui.mjs',
	'build-cli': 'build-cli.mjs',
	'build-package': 'build-package.mjs',
	typecheck: 'typecheck-all.mjs',
	clean: 'clean.mjs',
	cleanup: 'cleanup.mjs',
	install: 'install.mjs',
	format: 'format.mjs',
	lint: 'lint.mjs',
	test: 'test.mjs',
	verify: 'verify.mjs',
	'check-exports': 'check-exports.mjs',
	'dead-code': 'dead-code.mjs',
	'fix-exports': 'fix-single-use.mjs',
	'clean-orphans': 'clean-orphans.mjs',
};

function printHelp() {
	console.log(`Usage: node build/tools/agent-run.mjs <command> [args...]

Commands:
  build-all       Full monorepo build
  build-shared    Build @langflower/shared
  build-server    Build @langflower/server
  build-ui        Build @langflower/ui
  build-cli       Build langflower CLI
  build-package   Build one package (pass key + optional script)
  typecheck       Typecheck all packages
  clean           Remove build artifacts
  cleanup         Remove node_modules and package-lock.json
  install         npm install
  format          Prettier format (pass --check to verify)
  lint            ESLint (pass --fix to auto-fix)
  test            Vitest (pass --unit, --integration, --watch)
  verify          build-all + exports check + unit + integration (pass --quick for unit only)
  check-exports   Detect orphan exports (pass --fix to auto-remove, --json for machine output)
  dead-code       List dead code: unused files, orphan exports, unused types (--json, --scope, --kind)
  fix-exports     Move single-use exports to consumer packages
  clean-orphans   Remove exports with zero consumers

Examples:
  node build/tools/agent-run.mjs build-all
  node build/tools/agent-run.mjs test --unit
  node build/tools/agent-run.mjs test --integration
  node build/tools/agent-run.mjs verify
  node build/tools/agent-run.mjs verify --quick
  node build/tools/agent-run.mjs check-exports
  node build/tools/agent-run.mjs check-exports --fix
  node build/tools/agent-run.mjs dead-code
  node build/tools/agent-run.mjs dead-code --json
  node build/tools/agent-run.mjs build-package ui typecheck
`);
}

const command = process.argv[2];
const args = process.argv.slice(3);

if (
	!command ||
	command === 'help' ||
	command === '-h' ||
	command === '--help'
) {
	printHelp();
	process.exit(command ? 0 : 1);
}

const script = COMMANDS[command];

if (!script) {
	console.error(`Unknown command: ${command}`);
	printHelp();
	process.exit(1);
}

const child = spawn(process.execPath, [path.join(BUILD_DIR, script), ...args], {
	cwd: ROOT,
	stdio: 'inherit',
	shell: false,
});

child.on('close', (code) => {
	process.exit(code ?? 1);
});

child.on('error', (error) => {
	console.error(`Failed to run ${command}: ${error.message}`);
	process.exit(1);
});

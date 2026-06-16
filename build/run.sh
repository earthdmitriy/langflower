#!/usr/bin/env bash
#
# Langflower build dispatcher — run any build task from bash.
#
# Usage:
#   ./build/run.sh <command> [args...]
#   bash build/run.sh build-all
#   bash build/run.sh build-package shared
#   bash build/run.sh build-package ui typecheck
#
# Commands:
#   build-all       Build all packages (shared → server → ui → cli)
#   build-shared    Build @langflower/shared only
#   build-server    Build @langflower/server only
#   build-ui        Build @langflower/ui only
#   build-cli       Build langflower CLI only
#   build-package   Build one package by key (shared|server|ui|cli)
#   typecheck       Typecheck all packages
#   clean           Remove dist/ and cache artifacts
#   cleanup         Remove node_modules and package-lock.json
#   install         Install npm dependencies
#   format          Format all files (Prettier); pass --check to verify
#   lint            Lint repository (ESLint); pass --fix to auto-fix
#   test            Run Vitest (pass --unit, --integration, --watch)
#   verify          build-all + unit + integration (pass --quick for unit only)
#
# On Windows use Git Bash, WSL, or run the .mjs file directly:
#   node build/build-all.mjs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/run-bash.sh
source "${SCRIPT_DIR}/lib/run-bash.sh"

COMMAND="${1:-}"

if [[ -z "${COMMAND}" ]]; then
	echo "Usage: bash build/run.sh <command> [args...]" >&2
	echo "Run: bash build/run.sh help" >&2
	exit 1
fi

shift

case "${COMMAND}" in
	build-all)
		run_build_script build-all.mjs "$@"
		;;
	build-shared)
		run_build_script build-shared.mjs "$@"
		;;
	build-server)
		run_build_script build-server.mjs "$@"
		;;
	build-ui)
		run_build_script build-ui.mjs "$@"
		;;
	build-cli)
		run_build_script build-cli.mjs "$@"
		;;
	build-package)
		run_build_script build-package.mjs "$@"
		;;
	typecheck)
		run_build_script typecheck-all.mjs "$@"
		;;
	clean)
		run_build_script clean.mjs "$@"
		;;
	cleanup)
		run_build_script cleanup.mjs "$@"
		;;
	install)
		run_build_script install.mjs "$@"
		;;
	format)
		run_build_script format.mjs "$@"
		;;
	lint)
		run_build_script lint.mjs "$@"
		;;
	test)
		run_build_script test.mjs "$@"
		;;
	verify)
		run_build_script verify.mjs "$@"
		;;
	help|-h|--help)
		grep '^#' "${SCRIPT_DIR}/run.sh" \
			| grep -v '^#!/' \
			| sed 's/^# \{0,1\}//'
		;;
	*)
		echo "Unknown command: ${COMMAND}" >&2
		echo "Run: bash build/run.sh help" >&2
		exit 1
		;;
esac

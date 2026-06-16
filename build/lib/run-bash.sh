#!/usr/bin/env bash
#
# Shared helpers for Langflower build shell scripts.
#
# Source this file from any script in build/:
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
#
# Provides:
#   ROOT      — repository root directory
#   BUILD_DIR — build/ directory
#   run_build_script — forwards to the matching Node entrypoint

# Fail fast: stop on errors, unset variables, and pipe failures.
set -euo pipefail

_build_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$(cd "${_build_lib_dir}/.." && pwd)"
ROOT="$(cd "${BUILD_DIR}/.." && pwd)"

# Runs a Node build script from the repo root.
# Arguments: <script-name.mjs> [extra args...]
run_build_script() {
	local script_file="$1"
	shift

	cd "${ROOT}"
	exec node "${BUILD_DIR}/${script_file}" "$@"
}

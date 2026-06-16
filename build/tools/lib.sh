#!/usr/bin/env bash
#
# Resolve repo root and forward to build/run.sh.
# Used by build/tools/* agent wrappers.

set -euo pipefail

_tools_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_build_dir="$(cd "${_tools_dir}/.." && pwd)"
ROOT="$(cd "${_build_dir}/.." && pwd)"

run_tool() {
	local command="$1"
	shift
	cd "${ROOT}"
	exec bash "${_build_dir}/run.sh" "${command}" "$@"
}

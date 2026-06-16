#!/usr/bin/env bash
# Typecheck all workspace packages without emitting files.
#
# Usage:
#   bash build/typecheck-all.sh
#   npm run typecheck

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script typecheck-all.mjs "$@"

#!/usr/bin/env bash
# Remove build artifacts (dist/, .angular/, tsbuildinfo).
#
# Usage:
#   bash build/clean.sh
#   npm run clean

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script clean.mjs "$@"

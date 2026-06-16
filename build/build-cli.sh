#!/usr/bin/env bash
# Build langflower CLI package (global `langflower` command).
#
# Usage:
#   bash build/build-cli.sh
#   npm run build:cli

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script build-cli.mjs "$@"

#!/usr/bin/env bash
# Build @langflower/shared (domain types and validators).
#
# Usage:
#   bash build/build-shared.sh
#   npm run build:shared

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script build-shared.mjs "$@"

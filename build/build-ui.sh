#!/usr/bin/env bash
# Build @langflower/ui (Angular SPA with ngDiagram).
#
# Usage:
#   bash build/build-ui.sh
#   npm run build:ui

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script build-ui.mjs "$@"

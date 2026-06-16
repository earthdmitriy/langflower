#!/usr/bin/env bash
# Build all monorepo packages in dependency order:
# shared → server → ui → cli
#
# Usage:
#   bash build/build-all.sh
#   npm run build

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script build-all.mjs "$@"

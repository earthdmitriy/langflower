#!/usr/bin/env bash
# Install npm workspace dependencies from the repository root.
#
# Usage:
#   bash build/install.sh
#   bash build/install.sh --legacy-peer-deps
#   npm run install:deps

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script install.mjs "$@"

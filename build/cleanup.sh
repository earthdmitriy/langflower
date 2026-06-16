#!/usr/bin/env bash
# Remove node_modules, package-lock.json, and workspace nested node_modules.
#
# Usage:
#   bash build/cleanup.sh
#   bash build/cleanup.sh --install
#   npm run cleanup
#   npm run cleanup:install

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script cleanup.mjs "$@"

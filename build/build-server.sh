#!/usr/bin/env bash
# Build @langflower/server (Express API and services).
#
# Usage:
#   bash build/build-server.sh
#   npm run build:server

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script build-server.mjs "$@"

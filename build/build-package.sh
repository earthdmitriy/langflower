#!/usr/bin/env bash
# Build a single package by workspace key.
#
# Usage:
#   bash build/build-package.sh shared
#   bash build/build-package.sh ui typecheck
#
# Keys: shared | server | ui | cli

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script build-package.mjs "$@"

#!/usr/bin/env bash
# Run Vitest unit + integration suites.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script test.mjs "$@"

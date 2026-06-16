#!/usr/bin/env bash
# Lint the repository with ESLint.
# Usage: bash build/lint.sh [--fix]
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script lint.mjs "$@"

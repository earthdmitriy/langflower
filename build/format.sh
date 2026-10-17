#!/usr/bin/env bash
# Format changed files with Prettier. Pass --all for the whole tree.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script format.mjs "$@"

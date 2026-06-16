#!/usr/bin/env bash
# Format all tracked project files with Prettier.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/run-bash.sh"
run_build_script format.mjs "$@"

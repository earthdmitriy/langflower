#!/usr/bin/env bash
# Agent tool: format all files with Prettier.
# Usage: bash build/tools/format.sh [--check]
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool format "$@"

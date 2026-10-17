#!/usr/bin/env bash
# Agent tool: format changed files with Prettier.
# Usage: bash build/tools/format.sh [--check] [--all]
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool format "$@"

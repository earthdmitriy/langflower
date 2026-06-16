#!/usr/bin/env bash
# Agent tool: lint with ESLint. Pass --fix to auto-fix.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool lint "$@"

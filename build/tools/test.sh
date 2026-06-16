#!/usr/bin/env bash
# Agent tool: run Vitest suites. Pass --unit, --integration, or --watch.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool test "$@"

#!/usr/bin/env bash
# Agent tool: build-all + unit + integration. Pass --quick for unit only.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool verify "$@"

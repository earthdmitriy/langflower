#!/usr/bin/env bash
# Agent tool: full monorepo build (shared → server → ui → cli).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool build-all "$@"

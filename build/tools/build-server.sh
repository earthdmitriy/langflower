#!/usr/bin/env bash
# Agent tool: build @langflower/server only.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool build-server "$@"

#!/usr/bin/env bash
# Agent tool: build langflower CLI only.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool build-cli "$@"

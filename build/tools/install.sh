#!/usr/bin/env bash
# Agent tool: install npm workspace dependencies.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool install "$@"

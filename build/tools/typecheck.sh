#!/usr/bin/env bash
# Agent tool: typecheck all workspace packages.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool typecheck "$@"

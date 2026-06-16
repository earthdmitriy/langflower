#!/usr/bin/env bash
# Agent tool: remove dist/ and cache artifacts.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool clean "$@"

#!/usr/bin/env bash
# Agent tool: build one package by key.
# Usage: bash build/tools/build-package.sh <shared|server|ui|cli> [script]
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool build-package "$@"

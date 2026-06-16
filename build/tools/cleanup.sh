#!/usr/bin/env bash
# Agent tool: wipe dependency trees and lockfiles.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
run_tool cleanup "$@"

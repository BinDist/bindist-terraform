#!/bin/bash
set -e

# BinDist - Top-level Build Orchestrator
# Usage: ./build.sh [aws|scaleway|all]
#
# Default target is "all". Each target runs the build.sh in its provider
# directory, producing the corresponding function.zip without touching
# Terraform or any cloud APIs.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

build_aws() {
    "$SCRIPT_DIR/aws/build.sh"
}

build_scaleway() {
    "$SCRIPT_DIR/scaleway/build.sh"
}

case "$TARGET" in
    aws)
        build_aws
        ;;
    scaleway)
        build_scaleway
        ;;
    all)
        build_aws
        echo ""
        build_scaleway
        ;;
    -h|--help|help)
        echo "Usage: $0 [aws|scaleway|all]"
        exit 0
        ;;
    *)
        echo "Error: unknown target '$TARGET'"
        echo "Usage: $0 [aws|scaleway|all]"
        exit 1
        ;;
esac

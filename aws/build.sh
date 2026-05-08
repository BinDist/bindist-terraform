#!/bin/bash
set -e

# BinDist - AWS Lambda Build Script
# Usage: ./build.sh
#
# Produces aws/function.zip from src/, ready to upload to Lambda. The AWS
# package owns its tsconfig and compiles src/ on its own behalf. The repo is
# an npm workspace, so dev/build deps live in the root node_modules.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
BUILD_DIR="$ROOT_DIR/build"
OUTPUT_ZIP="$SCRIPT_DIR/function.zip"

echo "=== BinDist - AWS Lambda Build ==="

command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "Error: zip is required"; exit 1; }

# Single workspace install at the repo root. Hoists everything into the root
# node_modules so tsc can resolve bare imports from src/ files.
cd "$ROOT_DIR"
echo "Installing workspace dependencies..."
npm ci

echo "Compiling TypeScript..."
npm run build -w aws

echo "Assembling deployment package..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy compiled code (aws/tsconfig.json's rootDir is ../src so dist/ already
# mirrors the original src/ tree — no provider subdirs to flatten).
cp -r "$SCRIPT_DIR/dist/"* "$BUILD_DIR/"

# Copy the AWS runtime manifest. Workspace mode doesn't keep a per-provider
# lockfile, so we resolve from package.json semver ranges in BUILD_DIR.
cp "$SCRIPT_DIR/package.json" "$BUILD_DIR/"

# Install production dependencies only
cd "$BUILD_DIR"
npm install --omit=dev --no-audit --no-fund

# Create zip archive
rm -f "$OUTPUT_ZIP"
zip -q -r "$OUTPUT_ZIP" .

echo "Lambda package created: $OUTPUT_ZIP ($(du -h "$OUTPUT_ZIP" | cut -f1))"

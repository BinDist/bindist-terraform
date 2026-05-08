#!/bin/bash
set -e

# BinDist - Scaleway Function Build Script
# Usage: ./build.sh
#
# Produces scaleway/function.zip from src/ and scaleway/src/, ready to upload
# to Scaleway Serverless Functions. Bundles the DynamoDB-to-SQL adapter shim,
# generated per-function entry points, pg, and @bindist/dynamo-to-pg.
#
# scaleway/tsconfig.json compiles both source trees in one pass with
# rootDir = .. , producing dist/src/ for shared code and dist/scaleway/src/
# for Scaleway-specific code. The repo is an npm workspace, so dev/build
# deps live in the root node_modules.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
BUILD_DIR="$ROOT_DIR/scaleway-build"
OUTPUT_ZIP="$SCRIPT_DIR/function.zip"

echo "=== BinDist - Scaleway Function Build ==="

command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "Error: zip is required"; exit 1; }

# Single workspace install at the repo root.
cd "$ROOT_DIR"
echo "Installing workspace dependencies..."
npm ci

echo "Compiling TypeScript source..."
npm run build -w scaleway

# Prepare build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Preserve the dist subtree (src/... and scaleway/src/...) verbatim so that
# compile-time relative paths match the runtime layout. Cross-tree imports
# like scaleway/src/* → src/shared/* resolve identically in both places.
cp -r "$SCRIPT_DIR/dist/"* "$BUILD_DIR/"

# Copy the Scaleway runtime manifest. Workspace mode doesn't keep a
# per-provider lockfile, so we resolve from package.json semver ranges
# in BUILD_DIR.
cp "$SCRIPT_DIR/package.json" "$BUILD_DIR/"
cd "$BUILD_DIR"
echo "Installing production dependencies..."
npm install --omit=dev --no-audit --no-fund

# Generate the API gateway entry point. Compiled Scaleway-specific sources
# already landed at $BUILD_DIR/scaleway/src/ via the verbatim dist copy above.
echo "Generating function entry points..."
node "$SCRIPT_DIR/dist/scaleway/src/entry-generator.js" "$BUILD_DIR"

# Create deployment zip
cd "$BUILD_DIR"
rm -f "$OUTPUT_ZIP"
echo "Creating deployment package..."
zip -q -r "$OUTPUT_ZIP" .
echo "Function package created: $OUTPUT_ZIP ($(du -h "$OUTPUT_ZIP" | cut -f1))"

#!/usr/bin/env bash
# Build the Depth Mask Plugin for production distribution.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_DIR="$PROJECT_ROOT/plugin"

echo "=== Depth Mask Plugin - Production Build ==="

# Install dependencies
echo "Installing dependencies..."
cd "$PLUGIN_DIR" && npm install

# Build the Vite frontend + Electron TypeScript
echo "Building frontend and Electron..."
npm run build

# Package with electron-builder
echo "Packaging Electron app..."
npm run electron:build

echo ""
echo "Build complete! Output is in $PLUGIN_DIR/dist/"
echo "============================================="

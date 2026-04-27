#!/bin/bash

# Script to build the prologue project and deploy to webdisto
# Usage: bash deploy.sh [destination_directory]

set -e  # Exit on any error

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROLOGUE_DIR="$SCRIPT_DIR"

# Check if we're in the prologue directory
if [ ! -f "$PROLOGUE_DIR/package.json" ]; then
    echo "Error: package.json not found. Make sure you're in the prologue directory."
    exit 1
fi

# Navigate to prologue directory
echo "Navigating to prologue directory..."
cd "$PROLOGUE_DIR"

# Run the build command
echo "Running bun run build..."
bun run build

# Check if dist directory was created
if [ ! -d "dist" ]; then
    echo "Error: dist directory was not created after build"
    exit 1
fi

cp -r vercel.json dist/vercel.json
# Get destination directory (default to webdisto directory if not specified)
DEST_DIR="${1:-/Users/hesdx/Documents/dump/tools-pgsetup}"

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Copy dist folder contents to destination
echo "Copying dist contents to $DEST_DIR..."
# Remove any existing files in destination (but keep .git if it exists)
find "$DEST_DIR" -maxdepth 1 -not -name '.git' -not -path "$DEST_DIR" -exec rm -rf {} + 2>/dev/null || true

# Copy all contents from dist to destination
cp -r dist/* "$DEST_DIR/" 2>/dev/null || true

echo "Build completed successfully!"
echo "Dist contents copied to: $DEST_DIR"

# Navigate to destination directory and commit/push
echo "Preparing to commit and push..."
cd "$DEST_DIR"

# Check if it's a git repository/Users/hesdx/Documents/dump/tools-pgsetup
if [ ! -d ".git" ]; then
    echo "Warning: $DEST_DIR is not a git repository. Initializing..."
    git init
    git remote add origin https://github.com/dump/tools-pgsetup.git 2>/dev/null || true
fi

# Configure git user (if not already configured)
if [ -z "$(git config user.name)" ]; then
    echo "Configuring git user..."
    git config user.name "blockhack31"
    git config user.email "blockhack31@users.noreply.github.com"
fi

# Add, commit, and push changes
echo "Committing and pushing changes..."
git add .
git commit -m "Deploy prologue build - $(date '+%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"
git push origin main || git push origin master || echo "Push failed or no remote configured"

echo "Deployment completed successfully!"

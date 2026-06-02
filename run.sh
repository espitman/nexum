#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use v20.12.0
else
  echo "nvm was not found at $NVM_DIR/nvm.sh"
  exit 1
fi

corepack enable
corepack prepare pnpm@10.12.4 --activate

if [ ! -d "node_modules" ]; then
  corepack pnpm install
fi

corepack pnpm dev --filter @nexum/desktop

#!/bin/bash
# Pull the latest code and rebuild Navi. Run on the Unraid server:
#   bash /mnt/user/appdata/navi/repo/scripts/update.sh
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "git isn't installed on this server. Check with: git --version" >&2
  echo "On Unraid, install it via the NerdTools/Un-Get plugin, or update the repo another way." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

git pull --ff-only
docker compose up -d --build
docker image prune -f
docker compose logs --tail=20 navi

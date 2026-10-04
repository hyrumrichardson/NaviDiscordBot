#!/bin/bash
# Run update.sh only if origin has new commits. Meant to run on a schedule on Unraid
# (User Scripts plugin, e.g. every 5 minutes):
#   bash /mnt/user/appdata/navi/repo/scripts/auto-update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Skip if the previous run is still building.
exec 9>/tmp/navi-auto-update.lock
flock -n 9 || exit 0

git fetch --quiet origin
local_rev=$(git rev-parse HEAD)
remote_rev=$(git rev-parse '@{u}')
[ "$local_rev" = "$remote_rev" ] && exit 0

echo "$(date '+%F %T') New commits: ${local_rev:0:7} -> ${remote_rev:0:7}"
git log --oneline "$local_rev..$remote_rev"
bash scripts/update.sh

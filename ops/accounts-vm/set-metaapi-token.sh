#!/usr/bin/env bash
# Replace the MetaApi token (e.g. after generating a new one). Run in Google Cloud Shell.
set -euo pipefail
VM="${VM:-fynx-accounts}"; ZONE="${ZONE:-us-central1-a}"
read -rsp "Paste the new MetaApi API access token, then press Enter (input is hidden): " TOKEN; echo
[ -n "$TOKEN" ] || { echo "No token entered."; exit 1; }
printf '%s' "$TOKEN" | gcloud secrets versions add accounts-metaapi-token --data-file=- >/dev/null; unset TOKEN
gcloud compute ssh "$VM" --zone="$ZONE" --command='sudo systemctl restart fynx-accounts'
echo "Token updated and service restarted."

#!/usr/bin/env bash
# Deploy the latest main branch to the accounts server (run in Google Cloud Shell).
# Re-runs the VM's startup script: pulls code, installs dependencies, restarts the service, then checks health.
set -euo pipefail
VM="${VM:-fynx-accounts}"; ZONE="${ZONE:-us-central1-a}"; DOMAIN="${DOMAIN:-accounts.fynxfinanceworld.com}"
gcloud compute ssh "$VM" --zone="$ZONE" --command='sudo google_metadata_script_runner startup'
sleep 3
if curl -fsS "https://${DOMAIN}/healthz" >/dev/null; then echo "Healthy: https://${DOMAIN}/healthz"; else
  echo "Health check failed. Recent logs:"; gcloud compute ssh "$VM" --zone="$ZONE" --command='sudo journalctl -u fynx-accounts -n 60 --no-pager'; exit 1; fi

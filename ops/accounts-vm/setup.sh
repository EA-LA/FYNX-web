#!/usr/bin/env bash
# One-time setup of the FYNX My Accounts server on Google Cloud.
# Run it in Google Cloud Shell (https://shell.cloud.google.com) while signed in as the project owner:
#
#   git clone https://github.com/EA-LA/FYNX-web.git && cd FYNX-web && bash ops/accounts-vm/setup.sh
#
# It is safe to run again: every step checks what already exists.
# It asks for the MetaApi token once (hidden input) and stores it only in Secret Manager.
set -euo pipefail

PROJECT="${PROJECT:-fynx-c7a28}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
VM="${VM:-fynx-accounts}"
DOMAIN="${DOMAIN:-accounts.fynxfinanceworld.com}"
SA_NAME="fynx-accounts"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
STRIPE_SECRET="FYNX_CONSUMER_STRIPE_SECRET_KEY"
here="$(cd "$(dirname "$0")" && pwd)"

step(){ printf '\n\033[1m==> %s\033[0m\n' "$*"; }
exists(){ "$@" >/dev/null 2>&1; }

step "Project ${PROJECT}"
gcloud config set project "$PROJECT" >/dev/null
gcloud services enable compute.googleapis.com secretmanager.googleapis.com cloudkms.googleapis.com >/dev/null

step "Service account for the server"
exists gcloud iam service-accounts describe "$SA" || gcloud iam service-accounts create "$SA_NAME" --display-name="FYNX My Accounts server"
for role in roles/firebaseauth.viewer roles/datastore.viewer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role="$role" --condition=None >/dev/null
done

step "Encryption key for saved investor passwords (Cloud KMS)"
exists gcloud kms keyrings describe fynx-accounts --location="$REGION" || gcloud kms keyrings create fynx-accounts --location="$REGION"
exists gcloud kms keys describe credentials --keyring=fynx-accounts --location="$REGION" || \
  gcloud kms keys create credentials --keyring=fynx-accounts --location="$REGION" --purpose=encryption
gcloud kms keys add-iam-policy-binding credentials --keyring=fynx-accounts --location="$REGION" \
  --member="serviceAccount:${SA}" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter >/dev/null

step "MetaApi token (Secret Manager)"
if exists gcloud secrets describe accounts-metaapi-token; then
  echo "Secret accounts-metaapi-token already exists (to replace it: bash ops/accounts-vm/set-metaapi-token.sh)."
else
  read -rsp "Paste your MetaApi API access token, then press Enter (input is hidden): " TOKEN; echo
  [ -n "$TOKEN" ] || { echo "No token entered."; exit 1; }
  printf '%s' "$TOKEN" | gcloud secrets create accounts-metaapi-token --replication-policy=automatic --data-file=- >/dev/null
  unset TOKEN
  echo "Saved."
fi
gcloud secrets add-iam-policy-binding accounts-metaapi-token --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor >/dev/null
if exists gcloud secrets describe "$STRIPE_SECRET"; then
  gcloud secrets add-iam-policy-binding "$STRIPE_SECRET" --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor >/dev/null
else
  echo "WARNING: secret ${STRIPE_SECRET} not found. Without it nobody can use the Professional MT login (safe default)."
fi

step "Static IP address and firewall"
exists gcloud compute addresses describe fynx-accounts-ip --region="$REGION" || gcloud compute addresses create fynx-accounts-ip --region="$REGION"
IP="$(gcloud compute addresses describe fynx-accounts-ip --region="$REGION" --format='value(address)')"
exists gcloud compute firewall-rules describe fynx-accounts-web || \
  gcloud compute firewall-rules create fynx-accounts-web --allow=tcp:80,tcp:443 --target-tags=fynx-accounts --description="HTTPS for accounts.fynxfinanceworld.com"

step "Server ${VM} (e2-small, Debian 12)"
if exists gcloud compute instances describe "$VM" --zone="$ZONE"; then
  gcloud compute instances add-metadata "$VM" --zone="$ZONE" --metadata-from-file=startup-script="${here}/startup.sh" --metadata=fynx-domain="$DOMAIN"
  echo "Server exists; updated its startup script. Run ops/accounts-vm/update.sh to apply."
else
  gcloud compute instances create "$VM" --zone="$ZONE" --machine-type=e2-small \
    --image-family=debian-12 --image-project=debian-cloud --boot-disk-size=20GB --boot-disk-type=pd-balanced \
    --address="$IP" --tags=fynx-accounts --service-account="$SA" --scopes=cloud-platform \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
    --metadata-from-file=startup-script="${here}/startup.sh" --metadata=fynx-domain="$DOMAIN"
fi

step "Daily disk backups (kept 14 days)"
exists gcloud compute resource-policies describe fynx-accounts-daily --region="$REGION" || \
  gcloud compute resource-policies create snapshot-schedule fynx-accounts-daily --region="$REGION" \
    --max-retention-days=14 --on-source-disk-delete=keep-auto-snapshots --daily-schedule --start-time=10:00
gcloud compute disks add-resource-policies "$VM" --zone="$ZONE" --resource-policies=fynx-accounts-daily >/dev/null 2>&1 || true

cat <<EOF

Done. Two things left for you:

1) DNS: at your domain provider add this record, then wait a few minutes:
     Type: A    Name: accounts    Value: ${IP}

2) Check it (after DNS works; HTTPS is issued automatically on first visit):
     curl https://${DOMAIN}/healthz      -> should print: ok

The server installs itself on first boot (about 3-5 minutes). Logs:
  gcloud compute ssh ${VM} --zone=${ZONE} --command='sudo journalctl -u fynx-accounts -n 50 --no-pager'
EOF

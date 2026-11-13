#!/usr/bin/env bash
# Runs as root on every boot of the fynx-accounts VM (Google Compute Engine startup script).
# Installs/updates Node 22, Caddy (automatic HTTPS) and the FYNX code, then (re)starts the service.
# Contains no secrets: run.sh reads them from Secret Manager at service start.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
meta(){ curl -fsS -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"; }
DOMAIN="$(meta instance/attributes/fynx-domain || echo accounts.fynxfinanceworld.com)"
BRANCH="$(meta instance/attributes/fynx-branch || echo main)"
APP=/opt/fynx-web
DATA=/var/lib/fynx-accounts

# Base packages, Node 22 (node:sqlite needs >= 22.13) and Caddy
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git python3 debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades >/dev/null
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=13?0:1)' 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

# Service user and private data directory
id fynx >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin fynx
install -d -m 0700 -o fynx -g fynx "$DATA"

# Code: public repository, pinned branch
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" reset -q --hard "origin/$BRANCH"
else
  git clone -q --depth 1 --branch "$BRANCH" https://github.com/EA-LA/FYNX-web.git "$APP"
fi
(cd "$APP" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)
chown -R root:root "$APP"; chmod 0755 "$APP/ops/accounts-vm/run.sh"

# systemd service
install -m 0644 "$APP/ops/accounts-vm/fynx-accounts.service" /etc/systemd/system/fynx-accounts.service
PROJECT="$(meta project/project-id)"
mkdir -p /etc/systemd/system/fynx-accounts.service.d
cat > /etc/systemd/system/fynx-accounts.service.d/project.conf <<EOF
[Service]
Environment=GOOGLE_CLOUD_PROJECT=${PROJECT}
Environment=ACCOUNTS_FIREBASE_PROJECT_ID=${PROJECT}
Environment=ACCOUNTS_KMS_KEY_NAME=projects/${PROJECT}/locations/us-central1/keyRings/fynx-accounts/cryptoKeys/credentials
EOF

# HTTPS reverse proxy
sed "s/{\$FYNX_DOMAIN}/${DOMAIN}/" "$APP/ops/accounts-vm/Caddyfile" > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable -q caddy fynx-accounts
systemctl restart caddy
systemctl restart fynx-accounts
echo "fynx-accounts startup complete for ${DOMAIN} (branch ${BRANCH}, $(git -C "$APP" rev-parse --short HEAD))"

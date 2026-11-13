#!/usr/bin/env bash
# Service entry point: loads secrets from Secret Manager into this process's environment only
# (never written to disk or logs), then starts the accounts server.
set -euo pipefail
meta(){ curl -fsS -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"; }
TOKEN="$(meta instance/service-accounts/default/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')"
PROJECT="$(meta project/project-id)"
secret(){ # prints the latest version of a secret, or nothing if it does not exist / is not readable
  curl -fsS -H "Authorization: Bearer ${TOKEN}" \
    "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/$1/versions/latest:access" 2>/dev/null \
    | python3 -c 'import sys,json,base64;print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode(),end="")' 2>/dev/null || true
}
ACCOUNTS_METAAPI_TOKEN="$(secret accounts-metaapi-token)"; export ACCOUNTS_METAAPI_TOKEN
FYNX_CONSUMER_STRIPE_SECRET_KEY="$(secret FYNX_CONSUMER_STRIPE_SECRET_KEY)"; export FYNX_CONSUMER_STRIPE_SECRET_KEY
unset TOKEN
[ -n "$ACCOUNTS_METAAPI_TOKEN" ] || echo "fynx-accounts: MetaApi token not available; MT login connections stay disabled."
[ -n "$FYNX_CONSUMER_STRIPE_SECRET_KEY" ] || echo "fynx-accounts: Stripe key not available; Professional check denies everyone."
exec /usr/bin/node /opt/fynx-web/scripts/accounts-server.cjs

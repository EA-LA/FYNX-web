# My Accounts server (accounts.fynxfinanceworld.com)

The website stays on GitHub Pages. The My Accounts pages on www call this small server for
connections, sessions and synced data. It runs on one Google Compute Engine VM in project `fynx-c7a28`.

| Piece | What it is |
| --- | --- |
| VM `fynx-accounts` | e2-small, Debian 12, us-central1-a, static IP, daily disk snapshots kept 14 days |
| Caddy | HTTPS for `accounts.fynxfinanceworld.com` (certificate issued and renewed automatically) |
| `fynx-accounts` service | `scripts/accounts-server.cjs` on 127.0.0.1:8080, as the unprivileged `fynx` user |
| Data | `/var/lib/fynx-accounts/accounts.sqlite` (directory mode 0700) |
| Investor passwords | Encrypted with Cloud KMS key `fynx-accounts/credentials`; never stored in plain text |
| Secrets | Secret Manager: `accounts-metaapi-token`, `FYNX_CONSUMER_STRIPE_SECRET_KEY` (existing) |
| Identity | Service account `fynx-accounts@…`: Firebase Auth viewer, Firestore viewer, KMS encrypt/decrypt, the two secrets |

Approximate cost: e2-small about $13/month, plus a static IP, 20 GB disk and snapshots (a few dollars). MetaApi is billed separately.

## First-time setup (about 10 minutes)
1. Open **Google Cloud Shell**: https://shell.cloud.google.com. Sign in with the Google account that owns the Firebase project.
2. Run:
   ```sh
   git clone https://github.com/EA-LA/FYNX-web.git && cd FYNX-web && bash ops/accounts-vm/setup.sh
   ```
   Paste the MetaApi token when asked. It is hidden while you paste and goes only into Secret Manager.
3. At your domain provider, add the DNS record the script prints: **A** record, name `accounts`, value = the IP shown.
4. After 5–10 minutes, open `https://accounts.fynxfinanceworld.com/healthz`. It should show `ok`.

## Updating after a merge
```sh
cd FYNX-web && git pull && bash ops/accounts-vm/update.sh
```

## Replacing the MetaApi token
```sh
bash ops/accounts-vm/set-metaapi-token.sh
```

## Logs
```sh
gcloud compute ssh fynx-accounts --zone=us-central1-a --command='sudo journalctl -u fynx-accounts -n 100 --no-pager'
```

## Behaviour
- **Who can connect.** Only Professional members can link MT4/MT5 with a login; it is checked with Stripe on the server. Without the Stripe secret, nobody can. Free tools (statement import, the one-click MT5 connector) are not affected.
- **Which websites may call it.** Only `https://www.fynxfinanceworld.com` and `https://fynxfinanceworld.com` (exact-origin CORS with credentials). Other origins get 403.
- **Sign-out.** The session cookie belongs to the accounts host. A non-secret "session present" hint is shared across `.fynxfinanceworld.com` so signing out on www also closes the accounts session.

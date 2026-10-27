# Secure Firebase GitHub Actions setup — FYNX

This change adds **preflight checks only**. It does **not** deploy production code. FYNX's production Firebase functions live in a separate local deployment project and contain shared products; the FYNX-web repository has source modules but lacks a complete, verified deployment manifest and source bundle for the newly requested Indicators, Market Hours, and Portfolio functions. Never run an unrestricted `firebase deploy --only functions` from a partial bundle.

## Owner: create Google Cloud trust (no JSON key)

Project ID: `fynx-c7a28`. GitHub repository: `EA-LA/FYNX-web`.

1. In Google Cloud, open **IAM & Admin → Workload Identity Federation**. Enable the IAM Credentials API and Security Token Service API if prompted. Create a pool named `github-actions` (or reuse an existing trusted pool). Add an **OIDC** provider named `github`, issuer `https://token.actions.githubusercontent.com`.
2. Use attribute mappings:
   - `google.subject = assertion.sub`
   - `attribute.repository = assertion.repository`
   - `attribute.repository_id = assertion.repository_id`
   - `attribute.ref = assertion.ref`
   - `attribute.environment = assertion.environment`
3. Set the provider attribute condition to `assertion.repository_id == '1115347907' && assertion.repository_owner == 'EA-LA'`. Add tighter production conditions if the same provider is reused by other applications.
4. Create a Google Cloud service account, e.g. `github-deploy`. Grant **no general admin roles** just for this authentication check.
5. On that service account, grant **Workload Identity User** to the GitHub principal set for `attribute.repository_id/1115347907` in your pool, with the full principal URI shown by Google Cloud. Do not grant access to all GitHub repositories. For access-token minting, Google Cloud may require the matching Service Account Token Creator permission; follow the `google-github-actions/auth` documentation for the exact configured federation mode.
6. In GitHub → Settings → Environments create `firebase-api-deploy`, restrict deployments to the `main` branch and require an authorized reviewer where available. The environment name is used for the OIDC job, not as permission to deploy.
7. In GitHub → Settings → Secrets and variables → Actions → **Variables** add:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`: provider resource name, e.g. `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github` (use your actual number)
   - `GCP_DEPLOY_SERVICE_ACCOUNT`: the full service-account email displayed in Google Cloud (e.g. `github-deploy@fynx-c7a28.iam.gserviceaccount.com`)
8. Merge the PR once checks pass and run **Actions → Firebase API preflight → Run workflow** on `main`. Confirm the test job and Google authentication job succeed. No keys need to be downloaded or pasted.

## Separate work required before enabling production deployment

- Identify the actual Functions exports corresponding to Indicators, Market Hours, Portfolio; these names were **not** found as dedicated exports in the checked repository.
- Version a complete build/packaging step that preserves all deployed exports or uses a verified isolated bundle, including a locked dependency tree and `firebase.json`.
- Verify current deployed functions, secrets, runtime, IAM, rollback path and exact `--only functions:NAME` list.
- Add a separate manually approved production deployment job after a staging/smoke run, using least-privilege service-specific roles rather than global Firebase/Secret Manager Admin by default.
- Ensure no deployment changes unrelated funded, billing, reminders, news, scheduler or MCP functions.
- Test live endpoints with known expected responses; do not claim they work until deployed and checked.

Do not create a service-account JSON private key, and never commit a credential to the repository.

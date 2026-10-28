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

## Production deployment (keyless, source-only)

Workflow: **Actions → Deploy FYNX API backend (keyless) → Run workflow** (`.github/workflows/deploy-api-backend.yml`, logic in `.github/scripts/fynx-api-deploy.cjs`). It runs only when started manually from `main`, in the `firebase-api-deploy` environment.

- **Targets:** `developerGateway` and `developerWorkspace` (us-central1, 1st gen). The Indicators, Market Hours and Portfolio APIs are routes inside these two functions (`/v1/indicators/*`, `/v1/markets/*`, `/v1/portfolio/*`), not separate exports. `developerHealth` is unchanged and not redeployed.
- **`mode: inventory`** (default, read-only): lists every function, records the targets' settings (secret and env var *names* only), downloads the live source and checks each developer file against every committed version in Git. It also builds and validates the deploy package. Nothing is changed.
- **`mode: deploy`**: same checks, then uploads the package and PATCHes each target with `updateMask=sourceUploadUrl`. Only the code changes; memory, timeout, instances, secret bindings, env vars, service account, trigger and invoker IAM stay as they are. Deployment is refused if live source contains changes that are not in Git, or if a target is not an existing ACTIVE function.
- **Verification:** new version is ACTIVE, live source is byte-identical to the package, locked settings unchanged, every other function's version and update time unchanged, the gateway still rejects requests without a key, and (optional) five known-answer requests with a test API key. Any failure triggers an automatic rollback to the source downloaded before the deploy.
- **Report:** a check run named `FYNX API <mode> report` on the commit. It never contains secret values or file contents.
- **Package:** only the 8 `backend/developer-*.cjs` files the API loads, `package.json`, `package-lock.json` and a generated `index.js` exporting exactly the two targets. Dependencies install from the lockfile.

### Minimum Google Cloud permissions for `github-deploy`

1. A custom project role with exactly these six permissions (no create, delete, IAM or invoke rights):

   ```
   gcloud iam roles create fynxApiSourceDeployer --project=fynx-c7a28 \
     --title="FYNX API source deployer" --stage=GA \
     --permissions=cloudfunctions.functions.get,cloudfunctions.functions.list,cloudfunctions.functions.sourceCodeGet,cloudfunctions.functions.sourceCodeSet,cloudfunctions.functions.update,cloudfunctions.operations.get

   gcloud projects add-iam-policy-binding fynx-c7a28 \
     --member="serviceAccount:github-deploy@fynx-c7a28.iam.gserviceaccount.com" \
     --role="projects/fynx-c7a28/roles/fynxApiSourceDeployer" --condition=None
   ```

   This is enough for `mode: inventory`.

2. For `mode: deploy` only: **Service Account User** on the targets' runtime service account (shown in the inventory report; for 1st-gen defaults this is `fynx-c7a28@appspot.gserviceaccount.com`). Grant it on that one service account, not on the project:

   ```
   gcloud iam service-accounts add-iam-policy-binding RUNTIME_SERVICE_ACCOUNT --project=fynx-c7a28 \
     --member="serviceAccount:github-deploy@fynx-c7a28.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

Not required: Firebase Admin, Cloud Functions Admin/Developer, Secret Manager roles (bindings are preserved, not rewritten), Cloud Build, Artifact Registry, Storage, or any JSON key.

Optional: add a FYNX **test** API key (from the developer workspace, test environment) as the `firebase-api-deploy` environment secret `FYNX_API_SMOKE_KEY` so verification also checks real responses. It is a revocable FYNX key, not a Google credential.

## Original preflight notes

### Separate work required before enabling production deployment

- Identify the actual Functions exports corresponding to Indicators, Market Hours, Portfolio; these names were **not** found as dedicated exports in the checked repository.
- Version a complete build/packaging step that preserves all deployed exports or uses a verified isolated bundle, including a locked dependency tree and `firebase.json`.
- Verify current deployed functions, secrets, runtime, IAM, rollback path and exact `--only functions:NAME` list.
- Add a separate manually approved production deployment job after a staging/smoke run, using least-privilege service-specific roles rather than global Firebase/Secret Manager Admin by default.
- Ensure no deployment changes unrelated funded, billing, reminders, news, scheduler or MCP functions.
- Test live endpoints with known expected responses; do not claim they work until deployed and checked.

Do not create a service-account JSON private key, and never commit a credential to the repository.

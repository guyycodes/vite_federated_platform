# CI/CD setup (platform repo)

Three workflows (`.github/workflows/`):

| workflow | trigger | does |
|---|---|---|
| `ci.yml` | PR + push | `npm ci` → `npm run verify` (typecheck+lint+test) → `npm run build` |
| `infra.yml` | PR/push on `infra/terraform/**` | `terraform fmt/validate/plan` (PR) → `apply` (main) |
| `deploy-host.yml` | push to `main` / manual | build host → upload to `$web` → publish prod `remotes.json` → purge Front Door |

All Azure auth is **GitHub OIDC** — no stored cloud secrets.

## 1. One-time Azure side (OIDC federated identity)

```bash
# An Entra app whose federated credential trusts this repo.
az ad app create --display-name gh-vite-federated-platform
APP_ID=$(az ad app list --display-name gh-vite-federated-platform --query '[0].appId' -o tsv)
az ad sp create --id "$APP_ID"
# Federated credential for the main branch (repeat with subject for environments/PRs):
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name":"gh-main","issuer":"https://token.actions.githubusercontent.com",
  "subject":"repo:<owner>/vite_federated_platform:ref:refs/heads/main",
  "audiences":["api://AzureADTokenExchange"]}'
```

Grant the SP (object id) roles — or set `github_deploy_principal_id` in Terraform to
have it do so:
- `Storage Blob Data Contributor` on the static-website storage account
- `CDN Profile Contributor` on the Front Door profile (purge)
- `Contributor` on the foundation resource group (for `infra.yml` apply) + `Storage
  Blob Data Contributor` on the tfstate account

## 2. GitHub repo/environment **variables** (Settings → Secrets and variables → Actions → Variables)

| name | example | used by |
|---|---|---|
| `AZURE_CLIENT_ID` | `<app id>` | login / terraform |
| `AZURE_TENANT_ID` | `<tenant>` | login / terraform |
| `AZURE_SUBSCRIPTION_ID` | `<sub>` | login / terraform |
| `AZURE_RESOURCE_GROUP` | `rg-edn-prod` | deploy purge |
| `AZURE_STORAGE_ACCOUNT` | `stednprod<hash>` | deploy upload |
| `AFD_PROFILE_NAME` | `afd-edn-prod` | deploy purge |
| `AFD_ENDPOINT_NAME` | `afde-edn-prod` | deploy purge |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | host build (public key) |
| `VITE_ADAPTER_URL` | `https://app.example.com` | host build (same-origin /api) |
| `VITE_REMOTES_MANIFEST_URL` | `/remotes.json` | host build |
| `TFSTATE_RG` / `TFSTATE_SA` / `TFSTATE_CONTAINER` | `rg-tfstate` / `sttfstateedn` / `tfstate` | terraform init |
| `TF_ENV` | `prod` | terraform env/state key |
| `ADAPTER_ORIGIN_HOST` | `adapter.<hash>.<region>.azurecontainerapps.io` | terraform `/api/*` route (after module deploy) |

The `*_NAME`/`*_ACCOUNT` values come from `terraform output` after the first
`infra.yml` apply.

## 3. Secrets

- `MODULE_REPO_TOKEN` — **only if** the module repo is private (used to checkout the
  sibling repo so the `@edn/contracts` file: link resolves).

### On publishing `@edn/contracts` (optional decoupling)

The sibling-checkout above is the **working default** — you do NOT need to publish
anything for CI to be green. Publishing the contract is an optional later step that lets
the host build with zero knowledge of the module repo.

Caveat (flagged by the module repo): a registry scope must match its owner.
- **GitHub Packages** requires `@<owner>/<name>` where `<owner>` is your GitHub user/org.
  So `@edn/contracts` can't be published there under a personal account — either create a
  GitHub org named `edn`, or rename the scope (e.g. `@<youruser>/contracts`) across both
  repos, or publish under `@<owner>/contracts` and add an `@<owner>:registry=` line to a
  consumer `.npmrc`.
- **npmjs.com** works with any scope you own (claim the `edn` org/scope, or rename).

Until you choose one, keep the sibling checkout — no scope change needed.

## Order of operations
1. `infra.yml` apply (foundation) → read outputs → set the `AZURE_*` / `AFD_*` vars.
2. Module repo deploys its apps → gives you `ADAPTER_ORIGIN_HOST` → set it → re-run
   `infra.yml` to add the `/api/*` + SSE routes.
3. `deploy-host.yml` ships the shell; the module repo ships the remote to
   `$web/modules/sourcing/`.

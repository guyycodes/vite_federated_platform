# Deploy runbook — get it all on Azure, then wipe it clean

Baby-steps to stand up the **whole platform** (foundation + host + module workloads +
remote) by hand with `az` + Terraform, then a teardown that removes **everything** so
nothing keeps billing.

> This manual bring-up is also exactly what the MODULE repo's future CI/CD will
> automate (azure_topology.txt §11). You authenticate once with `az login`; no GitHub
> OIDC needed for the manual path.

Two repos are referenced:
- `vite_federated_platform`  (this repo — foundation Terraform + host shell)
- `api_event_driven_system`  (module repo — image, Service Bus, Postgres, ACA apps, remote)

Approx idle cost while it's up: a few dollars/day (AFD Standard + Postgres B1ms +
Service Bus Standard + a warm broker replica). **Tear it down when done** (Part C).

---

## Part A — Prerequisites (once)

1. Install tools:
   - Azure CLI: `az version`  (install: `brew install azure-cli`)
   - Terraform **or** OpenTofu: `terraform version` or `tofu version`
     (every `terraform` command below works as `tofu` too)
   - Node 20: `node -v`
   - (No Docker needed — we build the image in the cloud with `az acr build`.)
2. A Clerk account (clerk.com) — free tier is fine.
3. An Azure subscription you can create resources in.

---

## Part B — Bring it up

### B1. Sign in + pick the subscription
```bash
az login
az account list -o table
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
az account show -o table
```

### B2. Set shell variables (reused throughout) 
```bash
export LOC=eastus
export ENV=dev
export RG=rg-edn-$ENV                      # the foundation puts everything here
export ME=$(az ad signed-in-user show --query id -o tsv)
# Pick GLOBALLY-UNIQUE names for state storage (lowercase, 3-24 chars, letters/digits):
export TFSTATE_RG=rg-tfstate
export TFSTATE_SA=sttfstateedn$RANDOM      # note the value it prints; reuse it exactly
echo "TFSTATE_SA=$TFSTATE_SA   <-- write this down"
```

### B3. Clerk (the identity provider)
1. clerk.com → create an application (Email + whatever providers).
2. **API Keys** → copy the **Publishable key** (`pk_test_…`).
   ```bash
   export CLERK_PK="pk_test_xxx"
   ```
3. Find your **JWKS URL** (API Keys → "Show JWKS URL", or it's
   `https://<your-subdomain>.clerk.accounts.dev/.well-known/jwks.json`).
   ```bash
   export CLERK_JWKS="https://<your-subdomain>.clerk.accounts.dev/.well-known/jwks.json"
   ```
4. **Sessions → Customize session token** → add these claims:
   ```json
   {
     "account_type": "{{user.public_metadata.accountType}}",
     "role": "{{user.public_metadata.role}}",
     "country": "{{user.public_metadata.country}}",
     "org_id": "{{org.id}}",
     "org_slug": "{{org.slug}}",
     "org_role": "{{org.role}}"
   }
   ```
5. **Users** → create 2 test users → each user → **Metadata → Public**:
   - user A: `{ "accountType": "omni", "role": "super_admin" }`  (sees the Dashboard)
   - user B: `{ "accountType": "gba", "country": "US" }`           (loads the module)

### B4. Bootstrap Terraform remote state (once)
```bash
az group create -n $TFSTATE_RG -l $LOC
az storage account create -n $TFSTATE_SA -g $TFSTATE_RG -l $LOC --sku Standard_LRS
az storage container create -n tfstate --account-name $TFSTATE_SA --auth-mode login
```

### B5. Apply the platform foundation (this repo)
```bash
cd vite_federated_platform/infra/terraform

cat > backend.$ENV.hcl <<EOF
resource_group_name  = "$TFSTATE_RG"
storage_account_name = "$TFSTATE_SA"
container_name       = "tfstate"
key                  = "platform/$ENV.tfstate"
EOF

cat > terraform.$ENV.tfvars <<EOF
project             = "edn"
environment         = "$ENV"
location            = "$LOC"
adapter_origin_host = ""        # filled in B11 after the adapter exists
EOF

terraform init -backend-config=backend.$ENV.hcl
terraform apply -var-file=terraform.$ENV.tfvars      # review, type yes
```
Capture outputs into variables:
```bash
export SA=$(terraform output -raw storage_account_name)
export ACR=$(terraform output -raw acr_login_server)
export ACR_NAME=$(terraform output -raw acr_name)
export ENVID=$(terraform output -raw aca_environment_id)
export AFD=$(terraform output -raw afd_endpoint_hostname)
export KV=$(terraform output -raw key_vault_uri)
export MIID=$(terraform output -raw workload_identity_id)
export MICLIENT=$(terraform output -raw workload_identity_client_id)
export MIPRIN=$(terraform output -raw workload_identity_principal_id)
echo "AFD endpoint: https://$AFD"
cd ../../..
```

### B6. Build the shared image in the cloud (no local Docker)
```bash
cd api_event_driven_system
export TAG=v1
az acr build --registry $ACR_NAME --image edn-app:$TAG .
cd ..
```

### B7. Service Bus (module Terraform, into the same RG)
```bash
cd api_event_driven_system/infra/servicebus
terraform init
terraform apply \
  -var resource_group_name=$RG \
  -var location=$LOC \
  -var namespace_name=sbns-edn-$ENV-$RANDOM \
  -var department=sourcing          # review, type yes
export SB_FQNS=$(terraform output -raw servicebus_fqns)
# Let the workload identity use Service Bus (data plane):
SB_NS_ID=$(az servicebus namespace show --query id -o tsv \
  -g $RG -n $(echo $SB_FQNS | cut -d. -f1))
az role assignment create --assignee $MIPRIN --role "Azure Service Bus Data Owner" --scope $SB_NS_ID
cd ../../..
```

### B8. Postgres (dev: public + allow-Azure; prod = private per topology)
```bash
export PGPASS='Edn_Cloud_Pass123!'         # change me
export PGNAME=psql-edn-$ENV-$RANDOM
az postgres flexible-server create -g $RG -n $PGNAME -l $LOC \
  --tier Burstable --sku-name Standard_B1ms --version 16 \
  --admin-user broker --admin-password "$PGPASS" \
  --database-name broker --public-access 0.0.0.0 --yes
# dev shortcut so the app connects without app-side SSL config:
az postgres flexible-server parameter set -g $RG -s $PGNAME \
  --name require_secure_transport --value OFF
export PGHOST="$PGNAME.postgres.database.azure.com"
```

### B9. Create the 3 ACA apps (order matters: internal FQDNs feed the next)
```bash
cd api_event_driven_system
COMMON="--environment $ENVID --image $ACR/edn-app:$TAG \
  --user-assigned $MIID --registry-server $ACR --registry-identity $MIID \
  --min-replicas 1"

# vendor-sim (internal)
az containerapp create -g $RG -n vendor-sim $COMMON \
  --ingress internal --target-port 8082 \
  --command "/bin/sh" --args "-c" "npm run start --workspace services/vendor-sim" \
  --env-vars VENDOR_SIM_PORT=8082 BROKER_DEPARTMENT=sourcing \
             SERVICEBUS_FQNS=$SB_FQNS AZURE_CLIENT_ID=$MICLIENT NODE_ENV=production
export VENDOR_FQDN=$(az containerapp show -g $RG -n vendor-sim --query properties.configuration.ingress.fqdn -o tsv)

# broker (internal, stays warm)
az containerapp create -g $RG -n broker $COMMON \
  --ingress internal --target-port 8081 \
  --command "/bin/sh" --args "-c" "npm run start --workspace services/broker" \
  --env-vars BROKER_PORT=8081 BROKER_DEPARTMENT=sourcing \
             SERVICEBUS_FQNS=$SB_FQNS AZURE_CLIENT_ID=$MICLIENT \
             VENDOR_SIM_URL=https://$VENDOR_FQDN \
             POSTGRES_HOST=$PGHOST POSTGRES_PORT=5432 POSTGRES_DB=broker \
             POSTGRES_USER=broker POSTGRES_PASSWORD="$PGPASS" \
             RING_BUFFER_SIZE=200 NODE_ENV=production
export BROKER_FQDN=$(az containerapp show -g $RG -n broker --query properties.configuration.ingress.fqdn -o tsv)

# adapter (external — fronted by AFD)
az containerapp create -g $RG -n adapter $COMMON \
  --ingress external --target-port 8080 --min-replicas 0 --max-replicas 3 \
  --command "/bin/sh" --args "-c" "npm run start --workspace services/adapter" \
  --env-vars ADAPTER_PORT=8080 BROKER_DEPARTMENT=sourcing \
             BROKER_URL=https://$BROKER_FQDN ADAPTER_PUBLIC_URL=https://$AFD \
             AUTH_MODE=jwt CLERK_JWKS_URL="$CLERK_JWKS" \
             CORS_ORIGINS=https://$AFD NODE_ENV=production
export ADAPTER_FQDN=$(az containerapp show -g $RG -n adapter --query properties.configuration.ingress.fqdn -o tsv)
echo "adapter FQDN: $ADAPTER_FQDN"

# DB migration (one-off job)
az containerapp job create -g $RG -n migrate --environment $ENVID \
  --image $ACR/edn-app:$TAG --trigger-type Manual --replica-timeout 600 \
  --user-assigned $MIID --registry-server $ACR --registry-identity $MIID \
  --command "/bin/sh" --args "-c" "npm run migrate" \
  --env-vars POSTGRES_HOST=$PGHOST POSTGRES_PORT=5432 POSTGRES_DB=broker \
             POSTGRES_USER=broker POSTGRES_PASSWORD="$PGPASS"
az containerapp job start -g $RG -n migrate
cd ..
```

### B10. Wire Front Door → adapter (the late-binding edge)
```bash
cd vite_federated_platform/infra/terraform
sed -i '' "s|adapter_origin_host = \"\"|adapter_origin_host = \"$ADAPTER_FQDN\"|" terraform.$ENV.tfvars
terraform apply -var-file=terraform.$ENV.tfvars      # adds /api/* + SSE routes
cd ../../..
```

### B11. Publish the host shell to $web
```bash
# let yourself write blobs:
SA_ID=$(az storage account show -n $SA -g $RG --query id -o tsv)
az role assignment create --assignee $ME --role "Storage Blob Data Contributor" --scope $SA_ID
sleep 30   # role propagation

cd vite_federated_platform
VITE_CLERK_PUBLISHABLE_KEY=$CLERK_PK VITE_ADAPTER_URL=https://$AFD \
  VITE_REMOTES_MANIFEST_URL=/remotes.json npm ci && \
VITE_CLERK_PUBLISHABLE_KEY=$CLERK_PK VITE_ADAPTER_URL=https://$AFD \
  VITE_REMOTES_MANIFEST_URL=/remotes.json npm run build

az storage blob upload-batch --account-name $SA --auth-mode login \
  -d '$web' -s apps/host/dist --overwrite
echo '{ "remotes":[{"name":"sourcing","entry":"/modules/sourcing/remoteEntry.js","exposedModule":"./SourcingModule"}] }' > /tmp/remotes.json
az storage blob upload --account-name $SA --auth-mode login \
  -c '$web' -f /tmp/remotes.json -n remotes.json --overwrite
cd ..
```

### B12. Publish the remote to $web/modules/sourcing/
```bash
cd api_event_driven_system
npm ci
( cd apps/web && VITE_ADAPTER_URL=https://$AFD npx vite build --base=/modules/sourcing/ )
az storage blob upload-batch --account-name $SA --auth-mode login \
  -d '$web/modules/sourcing' -s apps/web/dist --overwrite
cd ..
```

### B13. Purge the edge + smoke test
```bash
az afd endpoint purge -g $RG --profile-name afd-edn-$ENV --endpoint-name afde-edn-$ENV \
  --content-paths '/*'
echo "Open: https://$AFD"
```
- Sign in as **user A (super_admin)** → you see the **Dashboard**.
- Sign in as **user B (gba)** → the **SOURCING module** loads from `/modules/sourcing/`,
  start a cert-verification, watch frames stream into the shared context.

**Troubleshooting**
- `/api/*` → 503 from AFD: the adapter origin health probe (`/healthz`) may be failing.
  Either add a 200 health route to the adapter, or repoint the probe:
  `az afd origin update -g $RG --profile-name afd-edn-$ENV --origin-group-name og-api \
   --origin-name api --probe-path / --probe-protocol Https`.
- 401 on `/api/*`: check `CLERK_JWKS_URL` on the adapter and that the session token
  customization (B3.4) is saved.
- Module 404: confirm `apps/web/dist` landed under `$web/modules/sourcing/`.

---

## Part C — Tear it ALL down (stop the billing)

The whole stack lives in **two resource groups**: `rg-edn-$ENV` (everything — AFD,
Storage, ACR, ACA, Postgres, Service Bus, Key Vault, VNet, identity) and `rg-tfstate`
(remote state). Deleting the RGs removes every resource regardless of how it was
created (Terraform OR the manual `az` steps).

### C1. Nuke the resource groups
```bash
az group delete -n rg-edn-$ENV --yes --no-wait
az group delete -n rg-tfstate --yes --no-wait
```

### C2. Purge the soft-deleted Key Vault (no cost, but frees the name)
```bash
# find it (KV name was kv-edn-$ENV-<hash>)
az keyvault list-deleted --query "[?contains(name,'kv-edn-$ENV')].name" -o tsv
az keyvault purge --name <that-name> --location $LOC   # if one is listed
```

### C3. Remove the deploy role assignment you added (cleanup; optional)
```bash
# (the SA is gone with the RG; this just removes the dangling assignment record)
az role assignment list --assignee $ME --query "[?contains(scope,'rg-edn-$ENV')]" -o table
```

### C4. Clerk (external — no Azure cost, but tidy up)
- Clerk dashboard → your application → **Settings → Delete application** (or keep it; it
  has no Azure cost).

### C5. Verify nothing is left
```bash
az group list -o table                          # neither rg-edn-$ENV nor rg-tfstate
az resource list --query "[?resourceGroup=='rg-edn-$ENV']" -o table   # empty/error
az keyvault list-deleted -o table               # no edn vault pending
```
Then check **Cost Management + Billing → Cost analysis** over the next 24h to confirm
charges flatline. Optional safety net for next time:
```bash
# a budget alert so a forgotten stack pings you:
az consumption budget create --budget-name edn-guard --amount 20 --time-grain Monthly \
  --category Cost --start-date $(date +%Y-%m-01) --end-date 2030-01-01 2>/dev/null || \
  echo "set a budget alert in the portal: Cost Management → Budgets"
```

---

## Quick teardown (TL;DR)
```bash
az group delete -n rg-edn-$ENV --yes --no-wait
az group delete -n rg-tfstate --yes --no-wait
az keyvault purge --name <kv-edn-...> --location $LOC   # optional
```
That's it — those two deletes stop all recurring charges.

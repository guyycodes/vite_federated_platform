# Platform foundation (Terraform)

Provisions the **shared foundation** the host shell deploys onto and the MODULE repo
(`api_event_driven_system`) plugs into — see `../../azure_topology.txt` §10 for the
ownership split. This repo's Terraform owns: resource group, VNet + subnets, static
`$web` storage, Front Door + WAF + routes, ACR, ACA managed environment, Key Vault,
Log Analytics, and the shared workload identity. The module repo owns the ACA apps,
Postgres, and Service Bus.

## One-time bootstrap (remote state)

```bash
az group create -n rg-tfstate -l eastus
az storage account create -n sttfstateedn -g rg-tfstate -l eastus --sku Standard_LRS
az storage container create -n tfstate --account-name sttfstateedn
cp backend.dev.hcl.example backend.dev.hcl    # edit names
cp terraform.tfvars.example terraform.dev.tfvars
```

## Apply

```bash
terraform init -backend-config=backend.dev.hcl
terraform plan  -var-file=terraform.dev.tfvars
terraform apply -var-file=terraform.dev.tfvars
```

First apply creates everything except the `/api/*` routes (the adapter FQDN doesn't
exist yet). After the **module repo** deploys the adapter, set `adapter_origin_host`
to its ACA FQDN and re-apply to wire `/api/*` + SSE through Front Door.

## Outputs the module repo consumes

`terraform output` exposes: `resource_group_name`, `aca_environment_id`,
`acr_login_server`/`acr_name`, `storage_account_name`, `afd_endpoint_hostname`,
`afd_profile_id` (the X-Azure-FDID), `key_vault_uri`, `private_endpoint_subnet_id`,
`workload_identity_*`, etc. The module reads these via a `terraform_remote_state`
data source pointed at this state, or as CI variables.

## GitHub Actions deploy identity (OIDC)

Create an Entra app + a federated credential for this repo, then either set
`github_deploy_principal_id` (Terraform grants the deploy roles) or assign by hand:
- `Storage Blob Data Contributor` on the storage account (upload to `$web`)
- `CDN Profile Contributor` on the Front Door profile (endpoint purge)

Set repo/environment **variables** (not secrets): `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. See `.github/workflows/`.

## Notes
- Provider pinned `azurerm ~> 3.110` to match the module repo.
- Custom domain: point a CNAME at `afd_endpoint_hostname`, then add an
  `azurerm_cdn_frontdoor_custom_domain` + association (left out so apply needs no DNS).

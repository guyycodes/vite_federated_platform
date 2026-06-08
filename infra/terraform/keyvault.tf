# Secrets store (Clerk config, connection strings, vendor API keys). RBAC-mode;
# the workload identity gets "Key Vault Secrets User" (identity.tf). The deployer
# running `terraform apply` should hold "Key Vault Secrets Officer" to seed values
# (or seed them out-of-band). ACA reads these as Key Vault secret references.
resource "azurerm_key_vault" "this" {
  name                       = local.kv_nm
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  tags                       = local.tags
}

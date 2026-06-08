# Shared workload identity for the ACA apps (the MODULE attaches it + adds its
# SB/Postgres role assignments). Platform grants the foundation-scoped roles here:
# pull images from ACR, read secrets from Key Vault.
resource "azurerm_user_assigned_identity" "workload" {
  name                = local.mi_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  tags                = local.tags
}

resource "azurerm_role_assignment" "workload_acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}

resource "azurerm_role_assignment" "workload_kv_secrets" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}

# --- Deploy identity (GitHub Actions OIDC). Optional: assign only when the SP's
#     object id is provided; otherwise grant these two roles by hand (README). ---
resource "azurerm_role_assignment" "deploy_blob" {
  count                = var.github_deploy_principal_id == "" ? 0 : 1
  scope                = azurerm_storage_account.web.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.github_deploy_principal_id
}

# Front Door purge needs Microsoft.Cdn/profiles/afdEndpoints/purge/action.
resource "azurerm_role_assignment" "deploy_afd" {
  count                = var.github_deploy_principal_id == "" ? 0 : 1
  scope                = azurerm_cdn_frontdoor_profile.this.id
  role_definition_name = "CDN Profile Contributor"
  principal_id         = var.github_deploy_principal_id
}

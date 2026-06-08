# These outputs are the §10 handoff contract — the MODULE repo (api_event_driven_system)
# reads them (via `terraform_remote_state` against this state, or as CI variables) to
# deploy its apps onto this foundation.

output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "location" {
  value = azurerm_resource_group.this.location
}

output "vnet_id" {
  value = azurerm_virtual_network.this.id
}

output "aca_infra_subnet_id" {
  value = azurerm_subnet.aca.id
}

output "private_endpoint_subnet_id" {
  value = azurerm_subnet.pe.id
}

output "postgres_subnet_id" {
  description = "Delegated subnet for the module's PostgreSQL Flexible Server (delegated_subnet_id)."
  value       = azurerm_subnet.pg.id
}

output "aca_environment_id" {
  value = azurerm_container_app_environment.this.id
}

output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "acr_name" {
  value = azurerm_container_registry.this.name
}

output "storage_account_name" {
  description = "Upload host shell to $web, remote to $web/modules/sourcing/."
  value       = azurerm_storage_account.web.name
}

output "web_endpoint" {
  description = "Direct static-website URL (origin behind Front Door)."
  value       = azurerm_storage_account.web.primary_web_endpoint
}

output "afd_endpoint_hostname" {
  description = "The public Front Door hostname (point your custom domain CNAME here)."
  value       = azurerm_cdn_frontdoor_endpoint.this.host_name
}

output "afd_profile_id" {
  description = "Front Door profile id; its resource GUID is the X-Azure-FDID the adapter must check."
  value       = azurerm_cdn_frontdoor_profile.this.id
}

output "key_vault_uri" {
  value = azurerm_key_vault.this.vault_uri
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.this.id
}

output "workload_identity_id" {
  value = azurerm_user_assigned_identity.workload.id
}

output "workload_identity_client_id" {
  value = azurerm_user_assigned_identity.workload.client_id
}

output "workload_identity_principal_id" {
  description = "Assign SB/Postgres data-plane roles to this in the MODULE repo."
  value       = azurerm_user_assigned_identity.workload.principal_id
}

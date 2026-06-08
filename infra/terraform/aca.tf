# The shared ACA Managed Environment (Consumption, VNet-injected, LA-backed). The
# MODULE repo deploys the adapter/broker/vendor-sim apps INTO this environment
# (image from the ACR above, identity = the workload MI). internal_load_balancer
# stays false so the adapter gets a public FQDN that Front Door fronts (FDID-locked).
resource "azurerm_container_app_environment" "this" {
  name                       = local.aca_env_name
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  infrastructure_subnet_id   = azurerm_subnet.aca.id
  tags                       = local.tags
}

# Shared registry. The MODULE repo pushes edn-app:<git-sha>; ACA pulls via the
# workload identity's AcrPull (admin user stays OFF).
resource "azurerm_container_registry" "this" {
  name                = local.acr_nm
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = var.acr_sku
  admin_enabled       = false
  tags                = local.tags
}

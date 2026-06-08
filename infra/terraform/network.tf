resource "azurerm_resource_group" "this" {
  name     = local.rg_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "this" {
  name                = local.vnet_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  address_space       = var.vnet_address_space
  tags                = local.tags
}

# Delegated to ACA (Consumption workload profile env needs a dedicated /23).
resource "azurerm_subnet" "aca" {
  name                 = "snet-aca-infra"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.aca_subnet_prefix]

  delegation {
    name = "aca"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# Where the MODULE repo lands private endpoints (e.g. private Blob artifacts).
resource "azurerm_subnet" "pe" {
  name                              = "snet-pe"
  resource_group_name               = azurerm_resource_group.this.name
  virtual_network_name              = azurerm_virtual_network.this.name
  address_prefixes                  = [var.pe_subnet_prefix]
  private_endpoint_network_policies = "Disabled"
}

# DELEGATED to PostgreSQL Flexible Server. PG Flexible's private mode is VNet
# integration into a delegated subnet (+ a private DNS zone the module creates),
# NOT a classic Private Endpoint — the module plugs its server in here.
resource "azurerm_subnet" "pg" {
  name                 = "snet-pg"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.pg_subnet_prefix]

  delegation {
    name = "pg-flexible"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

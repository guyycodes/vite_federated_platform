# Static-website storage = the single origin for BOTH the host shell ($web/) and
# the SOURCING remote ($web/modules/sourcing/). Same AFD domain ⇒ no CORS for the
# federation. 404 → index.html so the SPA handles client routing.
resource "azurerm_storage_account" "web" {
  name                            = local.storage_nm
  resource_group_name             = azurerm_resource_group.this.name
  location                        = azurerm_resource_group.this.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = true # the $web container is public-by-design (behind AFD)

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html"
  }

  tags = local.tags
}

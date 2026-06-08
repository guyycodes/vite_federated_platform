# Azure Front Door Standard — the ONLY public surface (§1). One profile/endpoint
# serves the SPA + remote from $web, and (once the adapter FQDN is known) proxies
# /api/* + SSE to the adapter. response_timeout_seconds=240 keeps SSE alive; AFD
# does not compress by default, so the event stream isn't buffered.
resource "azurerm_cdn_frontdoor_profile" "this" {
  name                     = local.afd_profile
  resource_group_name      = azurerm_resource_group.this.name
  sku_name                 = "Standard_AzureFrontDoor"
  response_timeout_seconds = 240
  tags                     = local.tags
}

resource "azurerm_cdn_frontdoor_endpoint" "this" {
  name                     = local.afd_endpoint
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  tags                     = local.tags
}

# --- WAF (Prevention + Microsoft default rules), associated to the endpoint ---
resource "azurerm_cdn_frontdoor_firewall_policy" "this" {
  name                = local.afd_waf
  resource_group_name = azurerm_resource_group.this.name
  sku_name            = azurerm_cdn_frontdoor_profile.this.sku_name
  enabled             = true
  mode                = "Prevention"

  managed_rule {
    type    = "Microsoft_DefaultRuleSet"
    version = "2.1"
    action  = "Block"
  }
}

resource "azurerm_cdn_frontdoor_security_policy" "this" {
  name                     = "secpol-${local.name}"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  security_policies {
    firewall {
      cdn_frontdoor_firewall_policy_id = azurerm_cdn_frontdoor_firewall_policy.this.id
      association {
        domain {
          cdn_frontdoor_domain_id = azurerm_cdn_frontdoor_endpoint.this.id
        }
        patterns_to_match = ["/*"]
      }
    }
  }
}

# --- og-web: the static $web origin (host shell + remote, same-origin) ---
resource "azurerm_cdn_frontdoor_origin_group" "web" {
  name                     = "og-web"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  load_balancing {
    sample_size                 = 4
    successful_samples_required = 3
  }

  health_probe {
    interval_in_seconds = 60
    path                = "/index.html"
    protocol            = "Https"
    request_type        = "HEAD"
  }
}

resource "azurerm_cdn_frontdoor_origin" "web" {
  name                           = "web"
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.web.id
  enabled                        = true
  host_name                      = azurerm_storage_account.web.primary_web_host
  origin_host_header             = azurerm_storage_account.web.primary_web_host
  https_port                     = 443
  http_port                      = 80
  priority                       = 1
  weight                         = 1000
  certificate_name_check_enabled = true
}

# All non-/api paths (SPA, /assets/*, /modules/sourcing/*, /remotes.json) → $web.
resource "azurerm_cdn_frontdoor_route" "web" {
  name                          = "web"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.web.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.web.id]
  supported_protocols           = ["Http", "Https"]
  patterns_to_match             = ["/*"]
  forwarding_protocol           = "HttpsOnly"
  https_redirect_enabled        = true
  link_to_default_domain        = true
}

# --- og-api: the adapter origin. Created only once adapter_origin_host is known
#     (§10 late-binding). "/api/*" is more specific than "/*", so it wins. ---
resource "azurerm_cdn_frontdoor_origin_group" "api" {
  count                    = var.adapter_origin_host == "" ? 0 : 1
  name                     = "og-api"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  load_balancing {
    sample_size                 = 4
    successful_samples_required = 3
  }

  health_probe {
    interval_in_seconds = 30
    path                = "/healthz"
    protocol            = "Https"
    request_type        = "GET"
  }
}

resource "azurerm_cdn_frontdoor_origin" "api" {
  count                          = var.adapter_origin_host == "" ? 0 : 1
  name                           = "api"
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.api[0].id
  enabled                        = true
  host_name                      = var.adapter_origin_host
  origin_host_header             = var.adapter_origin_host
  https_port                     = 443
  http_port                      = 80
  priority                       = 1
  weight                         = 1000
  certificate_name_check_enabled = true
}

resource "azurerm_cdn_frontdoor_route" "api" {
  count                         = var.adapter_origin_host == "" ? 0 : 1
  name                          = "api"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.api[0].id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.api[0].id]
  supported_protocols           = ["Https"]
  patterns_to_match             = ["/api/*"]
  forwarding_protocol           = "HttpsOnly"
  https_redirect_enabled        = true
  link_to_default_domain        = true
}

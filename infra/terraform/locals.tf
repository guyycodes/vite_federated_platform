locals {
  name = "${var.project}-${var.environment}" # e.g. edn-dev

  # Globally-unique, lowercase-alnum names (storage <=24, acr <=50, kv <=24) get a
  # short deterministic suffix from the subscription so re-applies are stable.
  suffix     = substr(sha1("${var.project}-${var.environment}-${data.azurerm_client_config.current.subscription_id}"), 0, 6)
  alnum      = replace(var.project, "-", "")
  storage_nm = substr("st${local.alnum}${var.environment}${local.suffix}", 0, 24)
  acr_nm     = substr("acr${local.alnum}${var.environment}${local.suffix}", 0, 50)
  kv_nm      = substr("kv-${local.alnum}-${var.environment}-${local.suffix}", 0, 24)

  rg_name      = "rg-${local.name}"
  vnet_name    = "vnet-${local.name}"
  log_name     = "log-${local.name}"
  aca_env_name = "cae-${local.name}"
  afd_profile  = "afd-${local.name}"
  afd_endpoint = "afde-${local.name}"
  afd_waf      = "waf${local.alnum}${var.environment}" # alnum only
  mi_name      = "id-${local.name}-workload"

  tags = merge({
    project     = var.project
    environment = var.environment
    managed_by  = "terraform"
    repo        = "vite_federated_platform"
  }, var.tags)
}

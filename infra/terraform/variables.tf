variable "project" {
  type        = string
  description = "Short project slug used in resource names (lowercase alnum)."
  default     = "edn"
}

variable "environment" {
  type        = string
  description = "Environment slug (dev | prod). Drives naming + a separate state."
  default     = "dev"
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "location" {
  type        = string
  description = "Azure region."
  default     = "eastus"
}

variable "vnet_address_space" {
  type        = list(string)
  description = "VNet CIDR(s)."
  default     = ["10.0.0.0/16"]
}

variable "aca_subnet_prefix" {
  type        = string
  description = "Subnet delegated to ACA (Consumption needs >= /23)."
  default     = "10.0.0.0/23"
}

variable "pe_subnet_prefix" {
  type        = string
  description = "Subnet for the module's private endpoints (e.g. private Blob)."
  default     = "10.0.2.0/24"
}

variable "pg_subnet_prefix" {
  type        = string
  description = "Subnet DELEGATED to PostgreSQL Flexible Server (VNet-integration mode)."
  default     = "10.0.3.0/24"
}

variable "log_retention_days" {
  type        = number
  description = "Log Analytics retention."
  default     = 30
}

variable "acr_sku" {
  type        = string
  description = "ACR SKU (Basic | Standard | Premium). Premium adds Private Link."
  default     = "Standard"
}

# Late-binding edge (§10): the adapter ACA FQDN only exists after the MODULE repo's
# first deploy. Leave empty on the first platform apply (web routes only); set it
# and re-apply to add the /api/* + SSE routes through Front Door.
variable "adapter_origin_host" {
  type        = string
  description = "Adapter ACA public FQDN for the og-api origin (empty = skip api routes)."
  default     = ""
}

# Optional: principalId (object id) of the GitHub Actions deploy identity (the Entra
# app's service principal). When set, Terraform grants it the deploy roles so the
# pipeline can upload to $web and purge Front Door. Leave empty to assign manually.
variable "github_deploy_principal_id" {
  type        = string
  description = "Object id of the GitHub OIDC deploy service principal (empty = skip)."
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Extra tags merged onto every resource."
  default     = {}
}

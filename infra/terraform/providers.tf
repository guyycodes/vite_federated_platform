# Platform foundation (the "landlord" — §10 of azure_topology.txt). Provisions the
# shared edge + static hosting + compute env + registry + network + vault that the
# host shell deploys onto and the MODULE repo consumes via outputs.
#
# Provider major pinned to match the module repo (api_event_driven_system) so both
# repos speak the same azurerm schema.
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.110"
    }
  }

  # Remote state in Azure Storage. Configured at init time so the bootstrap state
  # container can differ per environment:
  #   terraform init -backend-config=backend.<env>.hcl
  # (see README.md). Comment this block out for a local-state trial.
  backend "azurerm" {}
}

provider "azurerm" {
  features {}
}

data "azurerm_client_config" "current" {}

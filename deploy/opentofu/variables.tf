variable "resource_group" {
  type    = string
  default = "spectre_rg"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "aks_name" {
  type    = string
  default = "spectre-aks"
}

variable "aks_dns_prefix" {
  type    = string
  default = "spectre-aks"
}

variable "ssh_public_key" {
  type = string
}

variable "system_vm_size" {
  type    = string
  default = "Standard_D4s_v5"
}

variable "system_node_count" {
  type    = number
  default = 1
}

variable "system_os_disk_gb" {
  type    = number
  default = 100
}

variable "spot_vm_size" {
  type    = string
  default = "Standard_D4s_v5"
}

variable "spot_node_count" {
  type    = number
  default = 2
}

variable "spot_os_disk_gb" {
  type    = number
  default = 100
}

variable "clickhouse_password" {
  type      = string
  sensitive = true
}

# Sanitized provider lock fixture for destination evidence capture smoke.
provider "registry.terraform.io/hashicorp/aws" {
  version     = "5.0.0"
  constraints = "~> 5.0"
  hashes = [
    "h1:exampleterraformproviderhashonlynotreal",
    "zh:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ]
}

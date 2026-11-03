# Fictional example only. It creates no real cloud resources by itself.
terraform {
  required_version = "~> 1.8"
  backend "s3" {
    bucket         = "demo-atlas-tfstate"
    key            = "platform/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "demo-atlas-tflock"
  }
}

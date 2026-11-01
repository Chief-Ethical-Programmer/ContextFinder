# Synthetic CloudCart Terraform fixture
module "payments" { source = "./modules/payments" }
module "catalog" { source = "./modules/catalog" }
module "orders" { source = "./modules/orders" }
# 3 of 11 migration modules are merged in the synthetic repository.

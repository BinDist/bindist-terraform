output "endpoint" {
  description = "Database connection endpoint"
  value       = scaleway_sdb_sql_database.main.endpoint
  sensitive   = true
}

output "database_name" {
  description = "Database name"
  value       = scaleway_sdb_sql_database.main.name
}

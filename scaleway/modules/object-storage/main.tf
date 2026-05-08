resource "scaleway_object_bucket" "applications" {
  name = "${var.name_prefix}-applications"

  versioning {
    enabled = var.versioning_enabled
  }

  lifecycle_rule {
    enabled = true

    abort_incomplete_multipart_upload_days = 7
  }

  tags = var.tags
}

resource "scaleway_object_bucket_acl" "applications" {
  bucket = scaleway_object_bucket.applications.name
  acl    = "private"
}

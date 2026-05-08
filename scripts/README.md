# Scripts

Client and CI/CD scripts for the Application Distribution System.

## Directory Structure

```
scripts/
├── ci-scripts/        # CI/CD automation scripts (PowerShell)
│   ├── Upload-Application.ps1  # Upload new application versions
│   └── Update-Version.ps1      # Update version metadata
└── tenant-scripts/    # Tenant management and customer scripts (PowerShell)
    ├── Add-Application.ps1    # Register applications
    ├── Add-Customer.ps1       # Create customers
    ├── Download-File.ps1      # Download files
    ├── List-Applications.ps1  # List available apps
    ├── List-Versions.ps1      # List versions
    └── New-ShareLink.ps1      # Create shareable download links
```

## Prerequisites

- PowerShell 5.1+ (Windows) or PowerShell Core 7+ (cross-platform)
- Environment variables configured (see below)

## Environment Variables

```powershell
# API endpoint URL (optional - defaults to https://api.bindist.eu)
$env:BINDIST_API_URL = "https://api.bindist.eu"

# Customer API key (for tenant scripts)
$env:API_KEY = "your-customer-api-key"

# Admin API key (for admin/CI scripts)
$env:ADMIN_API_KEY = "your-admin-api-key"
```

**Note:** The `-ApiUrl` parameter defaults to `https://api.bindist.eu` if `BINDIST_API_URL` is not set.

---

## CI Scripts

Located in `ci-scripts/`. Scripts for CI/CD pipelines. Require admin API key.

### Upload-Application.ps1

Uploads a new version of an application. Use in CI/CD to publish releases.

```powershell
# Basic usage
.\ci-scripts\Upload-Application.ps1 -ApplicationId "myapp" -Version "1.0.0" -FilePath ".\myapp.exe"

# With options
.\ci-scripts\Upload-Application.ps1 -ApplicationId "myapp" -Version "2.0.0" -FilePath ".\myapp.exe" -ReleaseNotes "Bug fixes" -RequiredTier Premium
```

### Update-Version.ps1

Updates metadata for an existing application version (release notes, active/enabled status, minimum client version).

```powershell
# Update release notes
.\ci-scripts\Update-Version.ps1 -TenantId $env:TENANT_ID -Secret $env:API_SECRET -ApplicationId "myapp" -Version "2.0.0" -ReleaseNotes "Fixed login bug"

# Enable a version for production downloads
.\ci-scripts\Update-Version.ps1 -TenantId $env:TENANT_ID -Secret $env:API_SECRET -ApplicationId "myapp" -Version "2.0.0" -IsEnabled $true
```

---

## Tenant Scripts

Located in `tenant-scripts/`. Scripts for tenant management and customer access.

Admin scripts (Add-Customer, Add-Application) require `ADMIN_API_KEY`.
Customer scripts (List-*, Download-*, New-ShareLink) require `API_KEY`.

### Add-Customer.ps1

Creates a new customer with an API key. Requires `ADMIN_API_KEY`.

```powershell
# Basic usage
.\tenant-scripts\Add-Customer.ps1 -Name "Acme Corp"

# With options
.\tenant-scripts\Add-Customer.ps1 -Name "Acme Corp" -Tier Premium -Notes "Enterprise customer"
```

### Add-Application.ps1

Registers a new application and assigns it to customers. Requires `ADMIN_API_KEY`.

```powershell
# Basic usage
.\tenant-scripts\Add-Application.ps1 -ApplicationId "myapp" -Name "My Application" -CustomerIds "admin-abc123"

# With multiple customers and options
.\tenant-scripts\Add-Application.ps1 -ApplicationId "myapp" -Name "My App" -CustomerIds "admin-abc123,admin-def456" -Description "A great app" -Tags "windows,desktop"
```

### List-Applications.ps1

Lists available applications. Requires `API_KEY`.

```powershell
# List all applications
.\tenant-scripts\List-Applications.ps1

# Search applications
.\tenant-scripts\List-Applications.ps1 -Search "my app"

# Filter by tags
.\tenant-scripts\List-Applications.ps1 -Tags "windows,desktop"

# Different output formats
.\tenant-scripts\List-Applications.ps1 -Format json
.\tenant-scripts\List-Applications.ps1 -Format csv
.\tenant-scripts\List-Applications.ps1 -Format object
```

### List-Versions.ps1

Lists versions for an application. Requires `API_KEY`.

```powershell
# List all versions
.\tenant-scripts\List-Versions.ps1 -ApplicationId "myapp"

# JSON output
.\tenant-scripts\List-Versions.ps1 -ApplicationId "myapp" -Format json
```

### Download-File.ps1

Downloads a file from the distribution system. Requires `API_KEY`.

```powershell
# Download to current directory
.\tenant-scripts\Download-File.ps1 -ApplicationId "myapp" -Version "1.0.0"

# Download to specific location
.\tenant-scripts\Download-File.ps1 -ApplicationId "myapp" -Version "1.0.0" -OutputPath "C:\Downloads"

# Download specific file (multi-file versions)
.\tenant-scripts\Download-File.ps1 -ApplicationId "myapp" -Version "1.0.0" -FileId "file-123"

# Skip checksum verification
.\tenant-scripts\Download-File.ps1 -ApplicationId "myapp" -Version "1.0.0" -SkipChecksumVerification
```

### New-ShareLink.ps1

Creates a shareable, time-limited download link that doesn't require authentication.

```powershell
# Basic usage
.\tenant-scripts\New-ShareLink.ps1 -ApiKey $env:API_KEY -ApplicationId "myapp" -Version "1.0.0"

# Custom expiration (5-1440 minutes, default 30)
.\tenant-scripts\New-ShareLink.ps1 -ApiKey $env:API_KEY -ApplicationId "myapp" -Version "1.0.0" -ExpiresInMinutes 60

# Multi-tenant mode
.\tenant-scripts\New-ShareLink.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp" -Version "1.0.0"
```

---

## Output Formats

Most scripts support multiple output formats:

| Format | Description |
|--------|-------------|
| `table` | Human-readable table (default) |
| `json` | JSON output for scripting |
| `csv` | CSV output for spreadsheets |
| `object` | PowerShell objects for piping |

---

## Examples

### Complete workflow

```powershell
# Set environment variables
$env:BINDIST_API_URL = "https://api.example.com/dev"
$env:ADMIN_API_KEY = "admin-key-here"

# Create a customer
$customer = .\tenant-scripts\Add-Customer.ps1 -Name "New Customer" -Tier Premium
Write-Host "Customer API Key: $($customer.apiKey)"

# Register an application for that customer
.\tenant-scripts\Add-Application.ps1 -ApplicationId "myapp" -Name "My App" -CustomerIds $customer.customerId

# Upload a version (typically done via CI)
.\ci-scripts\Upload-Application.ps1 -ApplicationId "myapp" -Version "1.0.0" -FilePath ".\release\myapp.exe"

# Now use customer API key
$env:API_KEY = $customer.apiKey

# List and download
.\tenant-scripts\List-Applications.ps1
.\tenant-scripts\List-Versions.ps1 -ApplicationId "myapp"
.\tenant-scripts\Download-File.ps1 -ApplicationId "myapp" -Version "1.0.0" -OutputPath "C:\Downloads"
```

### CI/CD Integration

```yaml
# Example GitHub Actions step
- name: Upload Release
  shell: pwsh
  env:
    BINDIST_API_URL: ${{ secrets.BINDIST_API_URL }}
    ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}
  run: |
    .\scripts\ci-scripts\Upload-Application.ps1 `
      -ApplicationId "myapp" `
      -Version "${{ github.ref_name }}" `
      -FilePath ".\build\myapp.exe" `
      -ReleaseNotes "Release ${{ github.ref_name }}"
```

<#
.SYNOPSIS
    Links or unlinks customers to/from an application.

.DESCRIPTION
    This script adds or removes customer access to an application.
    Requires admin API key.
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER ApplicationId
    The application to modify (required).

.PARAMETER AddCustomerIds
    Comma-separated list of customer IDs to grant access.

.PARAMETER RemoveCustomerIds
    Comma-separated list of customer IDs to revoke access.

.EXAMPLE
    .\Link-Customer.ps1 -ApiKey "your-api-key" -ApplicationId "myapp" -AddCustomerIds "customer-123,customer-456"

.EXAMPLE
    .\Link-Customer.ps1 -ApiKey "your-api-key" -ApplicationId "myapp" -RemoveCustomerIds "customer-123"

.EXAMPLE
    .\Link-Customer.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp" -AddCustomerIds "customer-123"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ApiKey,

    [Parameter(Mandatory=$false)]
    [string]$TenantId,

    [Parameter(Mandatory=$false)]
    [string]$Secret,

    [Parameter(Mandatory=$true)]
    [string]$ApplicationId,

    [Parameter(Mandatory=$false)]
    [string]$AddCustomerIds,

    [Parameter(Mandatory=$false)]
    [string]$RemoveCustomerIds,

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = $(if ($env:BINDIST_API_URL) { $env:BINDIST_API_URL } else { "https://api.bindist.eu" })
)

$ErrorActionPreference = "Stop"

# Validate required parameters
if (-not $ApiUrl) {
    Write-Error "API URL is required. Set BINDIST_API_URL environment variable or use -ApiUrl parameter."
    exit 1
}

if (-not $AddCustomerIds -and -not $RemoveCustomerIds) {
    Write-Error "Must specify -AddCustomerIds or -RemoveCustomerIds (or both)."
    exit 1
}

# Determine API key: single-tenant (ApiKey) or multi-tenant (TenantId.Secret)
if (-not $ApiKey) {
    $ApiKey = $env:API_KEY
}

if (-not $ApiKey) {
    if (-not $TenantId) { $TenantId = $env:TENANT_ID }
    if (-not $Secret) { $Secret = $env:API_SECRET }

    if ($TenantId -and $Secret) {
        $ApiKey = "$TenantId.$Secret"
    } else {
        Write-Error "Authentication required. Provide -ApiKey or both -TenantId and -Secret."
        exit 1
    }
}

$AdminApiKey = $ApiKey

# Parse customer ID lists
$addList = @()
if ($AddCustomerIds) {
    $addList = @($AddCustomerIds -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

$removeList = @()
if ($RemoveCustomerIds) {
    $removeList = @($RemoveCustomerIds -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

Write-Host "Updating application customers..." -ForegroundColor Cyan
Write-Host "  Application: $ApplicationId"
if ($addList.Count -gt 0) {
    Write-Host "  Adding: $($addList -join ', ')"
}
if ($removeList.Count -gt 0) {
    Write-Host "  Removing: $($removeList -join ', ')"
}

# Build request body
$body = @{
    addCustomerIds = $addList
    removeCustomerIds = $removeList
}

# Make API request
$headers = @{
    "Authorization" = "Bearer $AdminApiKey"
    "Content-Type" = "application/json"
}

$uri = "$ApiUrl/v1/management/applications/$ApplicationId/customers"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Put -Headers $headers -Body ($body | ConvertTo-Json)

    if ($response.success) {
        Write-Host ""
        Write-Host "Application customers updated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Result:" -ForegroundColor Yellow
        Write-Host "  Application: $($response.data.applicationId)"
        Write-Host "  Current customers: $($response.data.customerIds -join ', ')"
        if ($response.data.added.Count -gt 0) {
            Write-Host "  Added: $($response.data.added -join ', ')" -ForegroundColor Green
        }
        if ($response.data.removed.Count -gt 0) {
            Write-Host "  Removed: $($response.data.removed -join ', ')" -ForegroundColor Red
        }
        Write-Host ""

        return $response.data
    } else {
        Write-Error "Failed to update application customers: $($response.error.message)"
    }
} catch {
    Write-Error "API request failed: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    exit 1
}

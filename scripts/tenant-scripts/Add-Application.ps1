<#
.SYNOPSIS
    Creates a new application in the distribution system.

.DESCRIPTION
    This script registers a new application that can have versions uploaded to it.
    The application is assigned to one or more customers who will be able to download it.
    Requires admin API key.
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER ApplicationId
    Unique identifier for the application (required). Must be alphanumeric with dashes/underscores.

.PARAMETER Name
    Display name for the application (required).

.PARAMETER CustomerIds
    Comma-separated list of customer IDs who can access this application (required).

.PARAMETER Description
    Optional description of the application.

.PARAMETER Tags
    Optional comma-separated list of tags.

.EXAMPLE
    .\Add-Application.ps1 -ApiKey "your-api-key" -ApplicationId "myapp" -Name "My Application" -CustomerIds "customer-123"

.EXAMPLE
    .\Add-Application.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp" -Name "My Application" -CustomerIds "customer-123"
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

    [Parameter(Mandatory=$true)]
    [string]$Name,

    [Parameter(Mandatory=$false)]
    [string]$CustomerIds,

    [Parameter(Mandatory=$false)]
    [string]$Description,

    [Parameter(Mandatory=$false)]
    [string]$Tags,

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = $(if ($env:BINDIST_API_URL) { $env:BINDIST_API_URL } else { "https://api.bindist.eu" })
)

$ErrorActionPreference = "Stop"

# Validate required parameters
if (-not $ApiUrl) {
    Write-Error "API URL is required. Set BINDIST_API_URL environment variable or use -ApiUrl parameter."
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

# Parse customer IDs
$customerIdList = $CustomerIds -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }

Write-Host "Creating application..." -ForegroundColor Cyan
Write-Host "  Application ID: $ApplicationId"
Write-Host "  Name: $Name"
Write-Host "  Customer IDs: $($customerIdList -join ', ')"

# Parse tags if provided
$tagList = @()
if ($Tags) {
    $tagList = @($Tags -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

# Build request body
$body = @{
    applicationId = $ApplicationId
    name = $Name
    customerIds = @($customerIdList)
}

if ($Description) {
    $body.description = $Description
}

if ($tagList.Count -gt 0) {
    $body.tags = @($tagList)
}

# Make API request
$headers = @{
    "Authorization" = "Bearer $AdminApiKey"
    "Content-Type" = "application/json"
}

$uri = "$ApiUrl/v1/management/applications"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ($body | ConvertTo-Json)

    if ($response.success) {
        Write-Host ""
        Write-Host "Application created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Application Details:" -ForegroundColor Yellow
        Write-Host "  Application ID: $($response.data.applicationId)"
        Write-Host "  Name: $($response.data.name)"
        Write-Host "  Description: $($response.data.description)"
        Write-Host "  Active: $($response.data.isActive)"
        Write-Host "  Created: $($response.data.createdAt)"
        Write-Host "  Customer IDs: $($response.data.customerIds -join ', ')"
        if ($response.data.tags) {
            Write-Host "  Tags: $($response.data.tags -join ', ')"
        }
        Write-Host ""

        return $response.data
    } else {
        Write-Error "Failed to create application: $($response.error.message)"
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

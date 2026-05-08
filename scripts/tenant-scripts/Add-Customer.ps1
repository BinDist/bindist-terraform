<#
.SYNOPSIS
    Creates a new customer in the application distribution system.

.DESCRIPTION
    This script creates a new customer (sub-customer) with an API key for accessing the distribution API.
    The new customer is created under a parent customer (defaults to "admin").
    Requires admin API key.
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER Name
    The customer name (required).

.PARAMETER Tier
    The customer tier: Basic, Premium, or Enterprise. Default: Basic

.PARAMETER ParentCustomerId
    The parent customer ID under which to create this customer. Default: admin

.PARAMETER Notes
    Optional notes about the customer.

.EXAMPLE
    .\Add-Customer.ps1 -ApiKey "your-api-key" -Name "Acme Corp"

.EXAMPLE
    .\Add-Customer.ps1 -TenantId "174385ac-..." -Secret "abc123" -Name "Acme Corp"

.EXAMPLE
    .\Add-Customer.ps1 -ApiKey $env:API_KEY -Name "Test Customer" -Tier Premium
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ApiKey,

    [Parameter(Mandatory=$false)]
    [string]$TenantId,

    [Parameter(Mandatory=$false)]
    [string]$Secret,

    [Parameter(Mandatory=$true)]
    [string]$Name,

    [Parameter(Mandatory=$false)]
    [ValidateSet("Basic", "Premium", "Enterprise")]
    [string]$Tier = "Basic",

    [Parameter(Mandatory=$false)]
    [string]$ParentCustomerId = "admin",

    [Parameter(Mandatory=$false)]
    [string]$Notes,

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

Write-Host "Creating customer..." -ForegroundColor Cyan
Write-Host "  Name: $Name"
Write-Host "  Tier: $Tier"
Write-Host "  Parent: $ParentCustomerId"

# Build request body
$body = @{
    name = $Name
    tier = $Tier
}

if ($Notes) {
    $body.notes = $Notes
}

# Make API request
$headers = @{
    "Authorization" = "Bearer $AdminApiKey"
    "Content-Type" = "application/json"
}

$uri = "$ApiUrl/v1/management/customers/$ParentCustomerId/apikeys"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ($body | ConvertTo-Json)

    if ($response.success) {
        Write-Host ""
        Write-Host "Customer created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Customer Details:" -ForegroundColor Yellow
        Write-Host "  Customer ID: $($response.data.customerId)"
        Write-Host "  Name: $($response.data.name)"
        Write-Host "  Tier: $($response.data.tier)"
        Write-Host "  Created: $($response.data.createdAt)"
        Write-Host ""
        Write-Host "API Key (save this - it will not be shown again):" -ForegroundColor Red
        Write-Host "  $($response.data.apiKey)"
        Write-Host ""

        # Return the response for scripting
        return $response.data
    } else {
        Write-Error "Failed to create customer: $($response.error.message)"
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

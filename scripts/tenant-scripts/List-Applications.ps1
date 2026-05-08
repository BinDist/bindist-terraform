<#
.SYNOPSIS
    Lists applications available to the authenticated customer.

.DESCRIPTION
    Retrieves and displays applications from the distribution API.
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER Search
    Optional search term to filter applications.

.PARAMETER Tags
    Optional comma-separated tags to filter by.

.PARAMETER Format
    Output format: table, json, csv, or object. Default: table

.EXAMPLE
    .\List-Applications.ps1 -ApiKey "your-api-key"

.EXAMPLE
    .\List-Applications.ps1 -TenantId "174385ac-..." -Secret "abc123"

.EXAMPLE
    .\List-Applications.ps1 -ApiKey $env:API_KEY -Search "my app"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ApiKey,

    [Parameter(Mandatory=$false)]
    [string]$TenantId,

    [Parameter(Mandatory=$false)]
    [string]$Secret,

    [Parameter(Mandatory=$false)]
    [string]$Search,

    [Parameter(Mandatory=$false)]
    [string]$Tags,

    [Parameter(Mandatory=$false)]
    [ValidateSet("table", "json", "csv", "object")]
    [string]$Format = "table",

    [Parameter(Mandatory=$false)]
    [int]$Page = 1,

    [Parameter(Mandatory=$false)]
    [int]$PageSize = 20,

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
    # Check environment variable
    $ApiKey = $env:API_KEY
}

if (-not $ApiKey) {
    # Fall back to multi-tenant mode
    if (-not $TenantId) { $TenantId = $env:TENANT_ID }
    if (-not $Secret) { $Secret = $env:API_SECRET }

    if ($TenantId -and $Secret) {
        $ApiKey = "$TenantId.$Secret"
    } else {
        Write-Error "Authentication required. Provide -ApiKey or both -TenantId and -Secret."
        exit 1
    }
}

# Build query string
$queryParams = @()
$queryParams += "page=$Page"
$queryParams += "pageSize=$PageSize"

if ($Search) {
    $queryParams += "search=$([uri]::EscapeDataString($Search))"
}

if ($Tags) {
    $queryParams += "tags=$([uri]::EscapeDataString($Tags))"
}

$queryString = $queryParams -join "&"

# Make API request
$headers = @{
    "Authorization" = "Bearer $ApiKey"
}

$uri = "$ApiUrl/v1/applications?$queryString"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers

    if ($response.success) {
        $applications = $response.data.applications
        $pagination = $response.meta.pagination

        switch ($Format) {
            "json" {
                $applications | ConvertTo-Json -Depth 10
            }
            "csv" {
                $applications | Select-Object applicationId, name, description, isActive, createdAt | ConvertTo-Csv -NoTypeInformation
            }
            "object" {
                $applications
            }
            default {
                # Table format
                Write-Host ""
                Write-Host "Applications (Page $($pagination.page) of $([math]::Ceiling($pagination.total / $pagination.limit)))" -ForegroundColor Cyan
                Write-Host ""

                if ($applications.Count -eq 0) {
                    Write-Host "No applications found." -ForegroundColor Yellow
                } else {
                    $applications | Format-Table -Property @(
                        @{Label="ID"; Expression={$_.applicationId}; Width=20},
                        @{Label="Name"; Expression={$_.name}; Width=30},
                        @{Label="Active"; Expression={$_.isActive}; Width=8},
                        @{Label="Tags"; Expression={($_.tags -join ", ")}; Width=20}
                    ) -AutoSize
                }

                Write-Host ""
                Write-Host "Total: $($pagination.total) applications" -ForegroundColor Gray
            }
        }

        return $applications
    } else {
        Write-Error "API error: $($response.error.message)"
    }
} catch {
    Write-Error "API request failed: $_"
    exit 1
}

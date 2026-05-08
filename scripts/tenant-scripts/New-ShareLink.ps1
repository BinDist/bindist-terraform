<#
.SYNOPSIS
    Creates a shareable download link for a file.

.DESCRIPTION
    Generates a short-lived public URL that can be shared with anyone to download
    a specific version of an application without requiring authentication.
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER ApplicationId
    The application ID (required).

.PARAMETER Version
    The version to share (required).

.PARAMETER FileId
    Optional file ID for multi-file versions.

.PARAMETER ExpiresInMinutes
    How long the link should be valid (5-1440 minutes). Default: 30 minutes.

.PARAMETER Format
    Output format: table, json, or object. Default: table

.EXAMPLE
    .\New-ShareLink.ps1 -ApiKey "your-api-key" -ApplicationId "myapp" -Version "1.0.0"

.EXAMPLE
    .\New-ShareLink.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp" -Version "1.0.0" -ExpiresInMinutes 60

.EXAMPLE
    .\New-ShareLink.ps1 -ApiKey $env:API_KEY -ApplicationId "myapp" -Version "1.0.0" -Format json
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
    [string]$Version,

    [Parameter(Mandatory=$false)]
    [string]$FileId,

    [Parameter(Mandatory=$false)]
    [ValidateRange(5, 1440)]
    [int]$ExpiresInMinutes = 30,

    [Parameter(Mandatory=$false)]
    [ValidateSet("table", "json", "object")]
    [string]$Format = "table",

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

# Build request body
$body = @{
    applicationId = $ApplicationId
    version = $Version
    expiresInMinutes = $ExpiresInMinutes
}

if ($FileId) {
    $body.fileId = $FileId
}

# Make API request
$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

$uri = "$ApiUrl/v1/downloads/share"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ($body | ConvertTo-Json)

    if ($response.success) {
        $data = $response.data

        switch ($Format) {
            "json" {
                $data | ConvertTo-Json -Depth 10
                return
            }
            "object" {
                return $data
            }
            default {
                # Table format
                Write-Host ""
                Write-Host "Share Link Created" -ForegroundColor Green
                Write-Host ""
                Write-Host "  Application: $ApplicationId"
                Write-Host "  Version:     $Version"
                if ($FileId) {
                    Write-Host "  File ID:     $FileId"
                }
                Write-Host ""
                Write-Host "  Share URL:   $($data.shareUrl)" -ForegroundColor Cyan
                Write-Host "  Token:       $($data.token)"
                Write-Host "  Expires:     $($data.expiresAt)"
                Write-Host "  Valid for:   $($data.expiresInMinutes) minutes"
                Write-Host ""
                return $data
            }
        }
    } else {
        Write-Error "API error: $($response.error.message)"
        exit 1
    }
} catch {
    Write-Error "API request failed: $_"
    exit 1
}

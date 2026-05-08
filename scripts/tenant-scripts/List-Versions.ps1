<#
.SYNOPSIS
    Lists versions for an application.

.DESCRIPTION
    Retrieves and displays available versions for a specific application.
    By default, only enabled versions are returned. Use -Channel "Test" to include
    disabled versions (useful for testing before enabling a version for production).
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER ApplicationId
    The application ID to list versions for (required).

.PARAMETER Channel
    Channel for filtering versions. Use "Test" to include disabled versions.
    Default: returns only enabled versions.

.PARAMETER Changelog
    Search term to filter versions by release notes content (case-insensitive).

.PARAMETER Format
    Output format: table, json, csv, or object. Default: table

.EXAMPLE
    .\List-Versions.ps1 -ApiKey "your-api-key" -ApplicationId "myapp"

.EXAMPLE
    .\List-Versions.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp"

.EXAMPLE
    .\List-Versions.ps1 -ApiKey $env:API_KEY -ApplicationId "myapp" -Channel "Test"
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
    [string]$Channel,

    [Parameter(Mandatory=$false)]
    [string]$Changelog,

    [Parameter(Mandatory=$false)]
    [ValidateSet("table", "json", "csv", "object")]
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

# Make API request
$headers = @{
    "Authorization" = "Bearer $ApiKey"
}

if ($Channel) {
    $headers["X-Channel"] = $Channel
}

$uri = "$ApiUrl/v1/applications/$ApplicationId/versions"
if ($Changelog) {
    $uri = "$uri`?changelog=$([System.Uri]::EscapeDataString($Changelog))"
}

try {
    $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers

    if ($response.success) {
        $versions = $response.data.versions

        switch ($Format) {
            "json" {
                $versions | ConvertTo-Json -Depth 10
            }
            "csv" {
                $versions | Select-Object versionId, version, fileSize, downloadCount, releaseNotes, createdAt | ConvertTo-Csv -NoTypeInformation
            }
            "object" {
                $versions
            }
            default {
                # Table format
                Write-Host ""
                Write-Host "Versions for '$ApplicationId'" -ForegroundColor Cyan
                if ($Channel) {
                    Write-Host "Channel: $Channel" -ForegroundColor Gray
                }
                if ($Changelog) {
                    Write-Host "Changelog search: $Changelog" -ForegroundColor Gray
                }
                Write-Host ""

                if ($versions.Count -eq 0) {
                    Write-Host "No versions found." -ForegroundColor Yellow
                } else {
                    $versions | Format-Table -Property @(
                        @{Label="Version"; Expression={$_.version}; Width=15},
                        @{Label="Size"; Expression={"{0:N2} MB" -f ($_.fileSize / 1MB)}; Width=12},
                        @{Label="Downloads"; Expression={$_.downloadCount}; Width=12},
                        @{Label="Active"; Expression={$_.isActive}; Width=8},
                        @{Label="Enabled"; Expression={$_.isEnabled}; Width=8},
                        @{Label="Created"; Expression={$_.createdAt.Substring(0,10)}; Width=12}
                    ) -AutoSize

                    # Show release notes if any version has them
                    $versionsWithNotes = $versions | Where-Object { $_.releaseNotes }
                    if ($versionsWithNotes) {
                        Write-Host "Release Notes:" -ForegroundColor Yellow
                        foreach ($v in $versionsWithNotes) {
                            Write-Host "  v$($v.version): $($v.releaseNotes)" -ForegroundColor Gray
                        }
                    }
                }

                Write-Host ""
                Write-Host "Total: $($versions.Count) versions" -ForegroundColor Gray
            }
        }

        return $versions
    } else {
        Write-Error "API error: $($response.error.message)"
    }
} catch {
    Write-Error "API request failed: $_"
    exit 1
}

<#
.SYNOPSIS
    Updates metadata for an existing application version.

.DESCRIPTION
    This script allows updating the release notes, active status, enabled status, or minimum
    client version for an existing application version. Requires admin API key.

    New versions are disabled by default (isEnabled = false). Use -IsEnabled $true to enable
    a version for production downloads after testing.

.PARAMETER TenantId
    The tenant ID (required).

.PARAMETER Secret
    The API key secret (required).

.PARAMETER ApplicationId
    The application ID (required).

.PARAMETER Version
    The version string to update (required).

.PARAMETER ReleaseNotes
    New release notes for the version. Use empty string to clear.

.PARAMETER IsActive
    Set the version active (true) or inactive (false).

.PARAMETER IsEnabled
    Enable (true) or disable (false) the version for production downloads.
    New versions are disabled by default until enabled by an admin.

.PARAMETER MinimumClientVersion
    Minimum client version required to use this version.

.EXAMPLE
    .\Update-Version.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp" -Version "2.0.0" -ReleaseNotes "Fixed login bug"

.EXAMPLE
    .\Update-Version.ps1 -TenantId $env:TENANT_ID -Secret $env:API_SECRET -ApplicationId "myapp" -Version "2.0.0" -IsEnabled $true

.EXAMPLE
    .\Update-Version.ps1 -TenantId $env:TENANT_ID -Secret $env:API_SECRET -ApplicationId "myapp" -Version "2.0.0" -IsActive $false
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$Secret,

    [Parameter(Mandatory=$true)]
    [string]$ApplicationId,

    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$false)]
    [string]$ReleaseNotes,

    [Parameter(Mandatory=$false)]
    [Nullable[bool]]$IsActive,

    [Parameter(Mandatory=$false)]
    [Nullable[bool]]$IsEnabled,

    [Parameter(Mandatory=$false)]
    [string]$MinimumClientVersion,

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = $(if ($env:BINDIST_API_URL) { $env:BINDIST_API_URL } else { "https://api.bindist.eu" })
)

$ErrorActionPreference = "Stop"

# Validate required parameters
if (-not $ApiUrl) {
    Write-Error "API URL is required. Set BINDIST_API_URL environment variable or use -ApiUrl parameter."
    exit 1
}

# Check if at least one update field is provided
if (-not $PSBoundParameters.ContainsKey('ReleaseNotes') -and
    -not $PSBoundParameters.ContainsKey('IsActive') -and
    -not $PSBoundParameters.ContainsKey('IsEnabled') -and
    -not $PSBoundParameters.ContainsKey('MinimumClientVersion')) {
    Write-Error "At least one update field must be provided: -ReleaseNotes, -IsActive, -IsEnabled, or -MinimumClientVersion"
    exit 1
}

# Construct the full API key from TenantId and Secret
$AdminApiKey = "$TenantId.$Secret"

# Build request body
$body = @{}

if ($PSBoundParameters.ContainsKey('ReleaseNotes')) {
    $body.releaseNotes = $ReleaseNotes
}

if ($PSBoundParameters.ContainsKey('IsActive')) {
    $body.isActive = $IsActive
}

if ($PSBoundParameters.ContainsKey('IsEnabled')) {
    $body.isEnabled = $IsEnabled
}

if ($PSBoundParameters.ContainsKey('MinimumClientVersion')) {
    $body.minimumClientVersion = $MinimumClientVersion
}

Write-Host "Updating version..." -ForegroundColor Cyan
Write-Host "  Application ID: $ApplicationId"
Write-Host "  Version: $Version"
Write-Host "  Updates:"
foreach ($key in $body.Keys) {
    Write-Host "    $key = $($body[$key])"
}

# Make API request
$headers = @{
    "Authorization" = "Bearer $AdminApiKey"
    "Content-Type" = "application/json"
}

$uri = "$ApiUrl/v1/applications/$ApplicationId/versions/$Version"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Patch -Headers $headers -Body ($body | ConvertTo-Json)

    if ($response.success) {
        Write-Host ""
        Write-Host "Version updated successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Updated Version:" -ForegroundColor Yellow
        Write-Host "  Application ID: $($response.data.applicationId)"
        Write-Host "  Version: $($response.data.version)"
        if ($response.data.releaseNotes) {
            Write-Host "  Release Notes: $($response.data.releaseNotes)"
        }
        Write-Host "  Is Active: $($response.data.isActive)"
        Write-Host "  Is Enabled: $($response.data.isEnabled)"
        if ($response.data.minimumClientVersion) {
            Write-Host "  Min Client Version: $($response.data.minimumClientVersion)"
        }
        Write-Host "  Updated At: $($response.data.updatedAt)"
        Write-Host ""

        return $response.data
    } else {
        Write-Error "API error: $($response.error.message)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Error "Version '$Version' not found for application '$ApplicationId'"
    } elseif ($statusCode -eq 403) {
        Write-Error "Admin access required to update versions"
    } else {
        Write-Error "API request failed: $_"
    }
    exit 1
}

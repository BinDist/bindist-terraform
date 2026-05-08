<#
.SYNOPSIS
    Uploads a new version of an application to the distribution system.

.DESCRIPTION
    This script uploads a binary file as a new version using pre-signed S3 URLs
    for reliable uploads of any size.
    Supports both single-tenant (ApiKey) and multi-tenant (TenantId + Secret) modes.

.PARAMETER ApiKey
    Full API key for single-tenant mode. If provided, TenantId and Secret are ignored.

.PARAMETER TenantId
    The tenant ID for multi-tenant mode.

.PARAMETER Secret
    The API key secret for multi-tenant mode.

.PARAMETER FilePath
    Path to the file to upload (required).

.PARAMETER ApplicationId
    The application ID (required).

.PARAMETER Version
    The version string (required).

.PARAMETER ReleaseNotes
    Optional release notes for this version.

.EXAMPLE
    .\Upload-Application.ps1 -ApiKey "your-api-key" -ApplicationId "myapp" -FilePath ".\myapp.exe" -Version "1.0.0"

.EXAMPLE
    .\Upload-Application.ps1 -TenantId "174385ac-..." -Secret "abc123..." -ApplicationId "myapp" -FilePath ".\myapp.exe" -Version "1.0.0"

.EXAMPLE
    .\Upload-Application.ps1 -ApiKey $env:API_KEY -ApplicationId "myapp" -FilePath ".\myapp.exe" -Version "2.0.0"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ApiKey,

    [Parameter(Mandatory=$false)]
    [string]$TenantId,

    [Parameter(Mandatory=$false)]
    [string]$Secret,

    [Parameter(Mandatory=$true)]
    [string]$FilePath,

    [Parameter(Mandatory=$true)]
    [string]$ApplicationId,

    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$false)]
    [string]$ReleaseNotes,

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

# Validate file exists
if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

$file = Get-Item $FilePath
$fileName = $file.Name
$fileSize = $file.Length

Write-Host "Uploading application version..." -ForegroundColor Cyan
Write-Host "  Application ID: $ApplicationId"
Write-Host "  Version: $Version"
Write-Host "  File: $fileName"
Write-Host "  Size: $([math]::Round($fileSize / 1MB, 2)) MB"

# Calculate checksum
Write-Host "Calculating checksum..." -ForegroundColor Gray
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($FilePath)
$hashBytes = $sha256.ComputeHash($stream)
$stream.Close()
$checksum = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
Write-Host "  Checksum: $checksum"

$headers = @{
    "Authorization" = "Bearer $AdminApiKey"
    "Content-Type" = "application/json"
}

# Step 1: Get upload URL
$body = @{
    applicationId = $ApplicationId
    version = $Version
    fileName = $fileName
    fileSize = $fileSize
    contentType = "application/octet-stream"
}

$uri = "$ApiUrl/v1/management/upload/large-url"
$response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ($body | ConvertTo-Json)

if (-not $response.success) {
    Write-Error "Failed to get upload URL: $($response.error.message)"
    exit 1
}

$uploadId = $response.data.uploadId
$uploadUrl = $response.data.uploadUrl

Write-Host "  Upload ID: $uploadId"

# Step 2: Upload file directly to S3
Write-Host "Uploading to S3..." -ForegroundColor Gray
$fileBytes = [System.IO.File]::ReadAllBytes($FilePath)

$uploadHeaders = @{
    "Content-Type" = "application/octet-stream"
}

Invoke-RestMethod -Uri $uploadUrl -Method Put -Headers $uploadHeaders -Body $fileBytes

Write-Host "  File uploaded to S3"

# Step 3: Complete upload
Write-Host "Completing upload..." -ForegroundColor Gray
$completeBody = @{
    uploadId = $uploadId
    applicationId = $ApplicationId
    version = $Version
    fileName = $fileName
    fileSize = $fileSize
    checksum = $checksum
}

if ($ReleaseNotes) {
    $completeBody.releaseNotes = $ReleaseNotes
}

$uri = "$ApiUrl/v1/management/upload/large-complete"
$response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body ($completeBody | ConvertTo-Json)

if ($response.success) {
    Write-Host ""
    Write-Host "Upload successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Version Details:" -ForegroundColor Yellow
    Write-Host "  Version ID: $($response.data.versionId)"
    Write-Host "  Application ID: $($response.data.applicationId)"
    Write-Host "  Version: $($response.data.version)"
    Write-Host "  File Size: $($response.data.fileSize)"
    Write-Host "  Checksum: $($response.data.checksum)"
    Write-Host ""

    return $response.data
} else {
    Write-Error "Upload failed: $($response.error.message)"
    exit 1
}

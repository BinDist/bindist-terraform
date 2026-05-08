<#
.SYNOPSIS
    Downloads a file from the distribution system.

.DESCRIPTION
    Gets a pre-signed download URL and downloads the file to the specified location.
    Verifies checksum after download.

    By default, only enabled versions can be downloaded. Use -Channel "Test" to download
    disabled versions (useful for testing before enabling a version for production).
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
    The version to download (required).

.PARAMETER OutputPath
    Path where the file should be saved. Default: current directory.

.PARAMETER FileId
    Optional file ID for multi-file versions.

.PARAMETER Channel
    Channel for accessing disabled versions. Use "Test" to download disabled versions.
    Default: only allows downloading enabled versions.

.PARAMETER SkipChecksumVerification
    Skip checksum verification after download.

.EXAMPLE
    .\Download-File.ps1 -ApiKey "your-api-key" -ApplicationId "myapp" -Version "1.0.0"

.EXAMPLE
    .\Download-File.ps1 -TenantId "174385ac-..." -Secret "abc123" -ApplicationId "myapp" -Version "1.0.0"

.EXAMPLE
    .\Download-File.ps1 -ApiKey $env:API_KEY -ApplicationId "myapp" -Version "1.0.0" -Channel "Test"
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
    [string]$OutputPath = ".",

    [Parameter(Mandatory=$false)]
    [string]$FileId,

    [Parameter(Mandatory=$false)]
    [string]$Channel,

    [Parameter(Mandatory=$false)]
    [switch]$SkipChecksumVerification,

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

# Build query string
$queryParams = @()
$queryParams += "applicationId=$([uri]::EscapeDataString($ApplicationId))"
$queryParams += "version=$([uri]::EscapeDataString($Version))"

if ($FileId) {
    $queryParams += "fileId=$([uri]::EscapeDataString($FileId))"
}

$queryString = $queryParams -join "&"

# Make API request to get download URL
$headers = @{
    "Authorization" = "Bearer $ApiKey"
}

if ($Channel) {
    $headers["X-Channel"] = $Channel
}

$uri = "$ApiUrl/v1/downloads/url?$queryString"

Write-Host "Getting download URL..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers

    if (-not $response.success) {
        Write-Error "API error: $($response.error.message)"
        exit 1
    }

    $downloadUrl = $response.data.url
    $fileName = $response.data.fileName
    $fileSize = $response.data.fileSize
    $expectedChecksum = $response.data.checksum
    $expiresAt = $response.data.expiresAt

    Write-Host "  File: $fileName"
    Write-Host "  Size: $([math]::Round($fileSize / 1MB, 2)) MB"
    Write-Host "  URL expires: $expiresAt"

    # Ensure output directory exists
    if (-not (Test-Path $OutputPath)) {
        New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
    }

    $outputFile = Join-Path $OutputPath $fileName

    # Download file
    Write-Host ""
    Write-Host "Downloading..." -ForegroundColor Yellow

    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($downloadUrl, $outputFile)

    Write-Host "  Downloaded to: $outputFile" -ForegroundColor Green

    # Verify checksum
    if (-not $SkipChecksumVerification -and $expectedChecksum) {
        Write-Host ""
        Write-Host "Verifying checksum..." -ForegroundColor Cyan

        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $stream = [System.IO.File]::OpenRead($outputFile)
        $hashBytes = $sha256.ComputeHash($stream)
        $stream.Close()
        $actualChecksum = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

        if ($actualChecksum -eq $expectedChecksum) {
            Write-Host "  Checksum verified!" -ForegroundColor Green
        } else {
            Write-Host "  Checksum mismatch!" -ForegroundColor Red
            Write-Host "  Expected: $expectedChecksum"
            Write-Host "  Actual: $actualChecksum"
            Write-Error "File integrity check failed"
            exit 1
        }
    }

    Write-Host ""
    Write-Host "Download complete!" -ForegroundColor Green

    return @{
        FilePath = $outputFile
        FileName = $fileName
        FileSize = $fileSize
        Checksum = $expectedChecksum
    }

} catch {
    Write-Error "Download failed: $_"
    exit 1
}

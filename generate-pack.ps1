param(
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$InstanceSource = Join-Path $env:APPDATA "SECTOR 27 Launcher\instances\mcdonaldsdnepr"
$TempDir = Join-Path $ProjectRoot "base-build"
$ReleaseDir = Join-Path $ProjectRoot "release"

$BaseZipName = "mcdonaldsdnepr-base-$Version.zip"
$BaseZipPath = Join-Path $ReleaseDir $BaseZipName

$DirsToCopy = @(
    "assets",
    "libraries",
    "versions",
    "defaultconfigs"
)

Write-Host ""
Write-Host "=== SECTOR 27 BASE GENERATOR ===" -ForegroundColor Cyan
Write-Host "Source: $InstanceSource"
Write-Host "Version: $Version"
Write-Host ""

if (!(Test-Path $InstanceSource)) {
    throw "Instance source not found: $InstanceSource"
}

Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $TempDir | Out-Null
New-Item -ItemType Directory -Force $ReleaseDir | Out-Null

foreach ($DirName in $DirsToCopy) {
    $From = Join-Path $InstanceSource $DirName
    $To = Join-Path $TempDir $DirName

    if (Test-Path $From) {
        Write-Host "Copying $DirName..." -ForegroundColor Yellow

        & robocopy $From $To /E /XD ".git" ".idea" ".vscode" /XF "Thumbs.db" "desktop.ini"

        if ($LASTEXITCODE -gt 7) {
            throw "Robocopy failed while copying $DirName with code $LASTEXITCODE"
        }
    } else {
        Write-Host "Skipped missing dir: $DirName" -ForegroundColor DarkYellow
    }
}

Remove-Item $BaseZipPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Creating base zip..." -ForegroundColor Yellow

Compress-Archive -Path "$TempDir\*" -DestinationPath $BaseZipPath -Force

$BaseZipSize = (Get-Item $BaseZipPath).Length
$BaseZipSha256 = (Get-FileHash $BaseZipPath -Algorithm SHA256).Hash.ToLower()

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host ""
Write-Host "BASE ZIP:" -ForegroundColor Cyan
Write-Host $BaseZipPath
Write-Host ""
Write-Host "SIZE:" -ForegroundColor Cyan
Write-Host $BaseZipSize
Write-Host ""
Write-Host "SHA256:" -ForegroundColor Cyan
Write-Host $BaseZipSha256
Write-Host ""
Write-Host "Upload this file to Google Drive:" -ForegroundColor Yellow
Write-Host $BaseZipName
Write-Host ""
<#
.SYNOPSIS
    Deploys Vectarly to an Oracle Cloud Ubuntu VM using Docker.
#>

param (
    [Parameter(Mandatory = $false)]
    [string]$OracleHost = "145.241.192.121",

    [Parameter(Mandatory = $false)]
    [string]$SshUser = "ubuntu",

    [Parameter(Mandatory = $false)]
    [string]$SshKeyPath = "C:\Users\vboxuser\.ssh\id_rsa",

    [Parameter(Mandatory = $false)]
    [string]$RemoteDir = "/home/ubuntu/vectarly",

    [Parameter(Mandatory = $false)]
    [int]$Port = 3004
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Vectarly Remote Deploy Pipeline" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Oracle Host : $OracleHost"
Write-Host "  SSH User    : $SshUser"
Write-Host "  SSH Key     : $SshKeyPath"
Write-Host "  Remote Dir  : $RemoteDir"
Write-Host "  Port        : $Port"
Write-Host "==========================================" -ForegroundColor Cyan

$TarFile = "vectarly.tar.gz"

try {
    # 1. Package repository into tarball
    Write-Host ""
    Write-Host "[1/4] Packing repository into $TarFile..." -ForegroundColor Green
    if (Test-Path $TarFile) { Remove-Item -Force $TarFile }

    & tar.exe -czf $TarFile `
        --exclude="node_modules" `
        --exclude="*/node_modules" `
        --exclude="dist" `
        --exclude="*/dist" `
        --exclude=".git" `
        --exclude="data" `
        --exclude="*.log" `
        --exclude="$TarFile" `
        .

    if (-not (Test-Path $TarFile)) {
        throw "Failed to generate $TarFile."
    }
    $sizeMb = [math]::Round((Get-Item $TarFile).Length / 1MB, 2)
    Write-Host "      Archive created successfully: $sizeMb MB" -ForegroundColor Green

    # 2. Ensure remote directory exists
    Write-Host ""
    Write-Host "[2/4] Ensuring remote directory $RemoteDir exists..." -ForegroundColor Green
    & ssh.exe -i "$SshKeyPath" -o StrictHostKeyChecking=accept-new "$SshUser@$OracleHost" "mkdir -p $RemoteDir"

    # 3. Upload bundle and deployment script
    Write-Host ""
    Write-Host "[3/4] Uploading bundle and deploy script via SCP..." -ForegroundColor Green
    & scp.exe -i "$SshKeyPath" -o StrictHostKeyChecking=accept-new "$TarFile" "$SshUser@${OracleHost}:${RemoteDir}/"
    & scp.exe -i "$SshKeyPath" -o StrictHostKeyChecking=accept-new "deploy-oracle.sh" "$SshUser@${OracleHost}:${RemoteDir}/"
    Write-Host "      Files uploaded successfully." -ForegroundColor Green

    # 4. Execute remote deployment script
    Write-Host ""
    Write-Host "[4/4] Executing remote deployment script on Oracle VM..." -ForegroundColor Green
    & ssh.exe -i "$SshKeyPath" -o StrictHostKeyChecking=accept-new -t "$SshUser@$OracleHost" `
        "chmod +x $RemoteDir/deploy-oracle.sh && $RemoteDir/deploy-oracle.sh $Port $RemoteDir"

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  Deployment completed successfully!" -ForegroundColor Green
    Write-Host "  Container available at: http://${OracleHost}:${Port}" -ForegroundColor Cyan
    Write-Host "  Domain configured:     https://vectarly.urspace.com" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan

} finally {
    if (Test-Path $TarFile) {
        Remove-Item -Force $TarFile
        Write-Host ""
        Write-Host "Cleaned up temporary local tarball." -ForegroundColor DarkGray
    }
}

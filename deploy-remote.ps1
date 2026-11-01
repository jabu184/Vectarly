<#
.SYNOPSIS
    Deploys Vectarly to an Oracle Cloud Ubuntu VM using Docker.

.DESCRIPTION
    1. Creates a clean .tar.gz bundle excluding node_modules, .git, and build artifacts.
    2. Uploads the bundle and deploy-oracle.sh to the Oracle VM via scp.
    3. Runs deploy-oracle.sh on the VM via ssh to configure iptables and launch with Docker Compose.

.EXAMPLE
    .\deploy-remote.ps1 -OracleHost "129.151.x.x" -SshKeyPath "$HOME\.ssh\oracle_key.key" -Port 3003
#>

param (
    [Parameter(Mandatory = $false, HelpMessage = "Oracle VM Public IP or Domain")]
    [string]$OracleHost = "YOUR_ORACLE_IP",

    [Parameter(Mandatory = $false, HelpMessage = "SSH Username")]
    [string]$SshUser = "ubuntu",

    [Parameter(Mandatory = $false, HelpMessage = "Path to SSH Private Key")]
    [string]$SshKeyPath = "$HOME\.ssh\id_rsa",

    [Parameter(Mandatory = $false, HelpMessage = "Target directory on remote VM")]
    [string]$RemoteDir = "/home/ubuntu/vectarly",

    [Parameter(Mandatory = $false, HelpMessage = "Host port to expose")]
    [int]$Port = 3003
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Vectarly Remote Deploy Pipeline" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Oracle Host : $OracleHost"
Write-Host "  SSH User    : $SshUser"
Write-Host "  SSH Key     : $SshKeyPath"
Write-Host "  Remote Dir  : $RemoteDir"
Write-Host "  Port        : $Port"
Write-Host "==========================================" -ForegroundColor Cyan

if ($OracleHost -eq "YOUR_ORACLE_IP") {
    Write-Host "`n⚠️ Please specify your Oracle Server IP using -OracleHost parameter:" -ForegroundColor Yellow
    Write-Host "   .\deploy-remote.ps1 -OracleHost `"129.151.x.x`" -SshKeyPath `"path\to\key`"`n" -ForegroundColor Yellow
    $OracleHost = Read-Host "Enter Oracle Server Public IP"
    if ([string]::IsNullOrWhiteSpace($OracleHost)) {
        Write-Error "Oracle Host IP is required."
    }
}

if (-not (Test-Path $SshKeyPath)) {
    Write-Host "`n⚠️ SSH key not found at default: $SshKeyPath" -ForegroundColor Yellow
    $SshKeyPath = Read-Host "Enter full path to your SSH private key (.key/.pem)"
    if (-not (Test-Path $SshKeyPath)) {
        Write-Error "SSH key file not found: $SshKeyPath"
    }
}

$TarFile = "vectarly.tar.gz"

try {
    # 1. Package the repository into a clean tarball
    Write-Host "`n📦 [1/4] Packing repository into $TarFile..." -ForegroundColor Green
    if (Test-Path $TarFile) { Remove-Item -Force $TarFile }

    & tar.exe -czvf $TarFile `
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
        Write-Error "Failed to generate $TarFile."
    }
    $sizeMb = [math]::Round((Get-Item $TarFile).Length / 1MB, 2)
    Write-Host "   [✓] Created bundle ($sizeMb MB)" -ForegroundColor Green

    # 2. Ensure remote directory exists
    Write-Host "`n📂 [2/4] Ensuring remote directory $RemoteDir exists..." -ForegroundColor Green
    & ssh.exe -i "$SshKeyPath" -o StrictHostKeyChecking=no "$SshUser@$OracleHost" "mkdir -p $RemoteDir"

    # 3. Upload bundle and deployment script
    Write-Host "`n📤 [3/4] Uploading bundle and deploy script via SCP..." -ForegroundColor Green
    & scp.exe -i "$SshKeyPath" -o StrictHostKeyChecking=no "$TarFile" "$SshUser@${OracleHost}:${RemoteDir}/"
    & scp.exe -i "$SshKeyPath" -o StrictHostKeyChecking=no "deploy-oracle.sh" "$SshUser@${OracleHost}:${RemoteDir}/"
    Write-Host "   [✓] Files uploaded successfully." -ForegroundColor Green

    # 4. Execute remote deployment script
    Write-Host "`n⚡ [4/4] Executing remote deployment script on Oracle VM..." -ForegroundColor Green
    & ssh.exe -i "$SshKeyPath" -o StrictHostKeyChecking=no -t "$SshUser@$OracleHost" `
        "chmod +x $RemoteDir/deploy-oracle.sh && $RemoteDir/deploy-oracle.sh $Port $RemoteDir"

    Write-Host "`n==========================================" -ForegroundColor Cyan
    Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
    Write-Host "🌐 Container available at: http://${OracleHost}:${Port}" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan

} finally {
    if (Test-Path $TarFile) {
        Remove-Item -Force $TarFile
        Write-Host "`n🧹 Cleaned up temporary local tarball." -ForegroundColor DarkGray
    }
}

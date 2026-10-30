#!/usr/bin/env pwsh
# Manual deploy of the serverless production stack (chip-tracker-prod, us-east-1).
# Normal deploys run from GitHub Actions; see infra/README.md.
# Usage: ./scripts/deploy-infra.ps1 -AlertEmail you@example.com [-NoDeploy] [-SkipPublish]

param(
    [Parameter(Mandatory = $true)][string]$AlertEmail,
    [switch]$NoDeploy,
    [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')

foreach ($tool in 'aws', 'node', 'dotnet') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed" }
}

$accountId = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($accountId)) { throw "No AWS credentials. Run 'aws configure' or 'aws sso login'." }
Write-Host "Account: $accountId (us-east-1)" -ForegroundColor Gray

if (-not $SkipPublish) {
    Write-Host "`nPublishing Lambda bundles..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'publish-lambdas.ps1')
}

Push-Location (Join-Path $root 'infra')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }

    Write-Host "`nInfrastructure changes:" -ForegroundColor Cyan
    npx cdk diff chip-tracker-prod -c "alertEmail=$AlertEmail"

    if ($NoDeploy) {
        Write-Host "`nDiff only (-NoDeploy)." -ForegroundColor Green
        return
    }

    Write-Host "`nDeploying..." -ForegroundColor Cyan
    npx cdk deploy chip-tracker-prod -c "alertEmail=$AlertEmail" --require-approval never --outputs-file cdk-outputs.json
    if ($LASTEXITCODE -ne 0) { throw 'cdk deploy failed' }

    Write-Host "`nDeployed. Outputs in infra/cdk-outputs.json. Upload the SPA next (see infra/README.md)." -ForegroundColor Green
}
finally {
    Pop-Location
}

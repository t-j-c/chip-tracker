# AWS CDK deployment script
# Usage: ./deploy-infra.ps1 [-Environment dev|prod] [-NoDeploy]

param(
    [string][ValidateSet("dev", "prod")]$Environment = "dev",
    [switch]$NoDeploy,
    [switch]$Destroy,
    [switch]$NoBootstrap
)

Write-Host "🚀 Chip Tracker Infrastructure Deployment" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Green

# Check prerequisites
Write-Host "`n📋 Checking prerequisites..." -ForegroundColor Cyan

# Check AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "❌ AWS CLI not installed" -ForegroundColor Red
    exit 1
}

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not installed" -ForegroundColor Red
    exit 1
}

# Check CDK CLI
if (-not (Get-Command cdk -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️ CDK CLI not installed. Installing..." -ForegroundColor Yellow
    npm install -g aws-cdk
}

# Get AWS account info
Write-Host "`n🔑 AWS Account Info:" -ForegroundColor Cyan
$accountId = & aws sts get-caller-identity --query Account --output text
$region = & aws configure get region
Write-Host "Account: $accountId" -ForegroundColor Gray
Write-Host "Region: $region" -ForegroundColor Gray

if ([string]::IsNullOrEmpty($accountId)) {
    Write-Host "❌ Could not get AWS account. Please run 'aws configure'" -ForegroundColor Red
    exit 1
}

# Change to infra directory
Push-Location infra

# Install/update dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Bootstrap (if not skipped)
if (-not $NoBootstrap) {
    Write-Host "`n⚙️ Bootstrapping CDK (one-time setup)..." -ForegroundColor Cyan
    npm run build
    & cdk bootstrap "aws://$accountId/$region"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️ Bootstrap failed (may already be done)" -ForegroundColor Yellow
    }
}

# Build TypeScript
Write-Host "`n🔨 Building TypeScript..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Show diff
Write-Host "`n📊 Infrastructure changes:" -ForegroundColor Cyan
& cdk diff --context env=$Environment

if ($Destroy) {
    Write-Host "`n⚠️ DESTROYING INFRASTRUCTURE" -ForegroundColor Red
    & cdk destroy --context env=$Environment --force
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Infrastructure destroyed" -ForegroundColor Green
    }
} elseif (-not $NoDeploy) {
    # Deploy
    Write-Host "`n🚀 Deploying infrastructure..." -ForegroundColor Cyan
    $stackName = "chip-tracker-$Environment"
    & cdk deploy --context env=$Environment --require-approval=never
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Deployment successful!" -ForegroundColor Green
        Write-Host "`n📤 Next steps:" -ForegroundColor Cyan
        Write-Host "1. Build and push Docker images" -ForegroundColor Gray
        Write-Host "   cd ../src/backend && docker build -t chip-tracker-backend ." -ForegroundColor Gray
        Write-Host "2. Check outputs" -ForegroundColor Gray
        Write-Host "   aws cloudformation describe-stacks --stack-name $stackName" -ForegroundColor Gray
        Write-Host "3. Monitor service" -ForegroundColor Gray
        Write-Host "   aws logs tail /ecs/chip-tracker/backend --follow" -ForegroundColor Gray
    } else {
        Write-Host "❌ Deployment failed" -ForegroundColor Red
    }
} else {
    Write-Host "`n✅ Synth successful (no deploy)" -ForegroundColor Green
}

Pop-Location

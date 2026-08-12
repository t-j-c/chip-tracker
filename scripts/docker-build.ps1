# Docker build script for Chip Tracker
# Usage: ./docker-build.ps1

param(
    [string]$ImageTag = "latest",
    [switch]$NoCacheBackend,
    [switch]$NoCacheFrontend,
    [switch]$BuildBackendOnly,
    [switch]$BuildFrontendOnly
)

Write-Host "🐳 Building Chip Tracker Docker images..." -ForegroundColor Cyan

# Build backend
if (-not $BuildFrontendOnly) {
    Write-Host "`n📦 Building backend image..." -ForegroundColor Green
    $backendBuildArgs = @()
    if ($NoCacheBackend) { $backendBuildArgs += "--no-cache" }
    
    & docker build @backendBuildArgs `
        -t "chip-tracker-backend:$ImageTag" `
        -f src/backend/Dockerfile `
        src/backend
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Backend build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Backend image built successfully" -ForegroundColor Green
}

# Build frontend
if (-not $BuildBackendOnly) {
    Write-Host "`n📦 Building frontend image..." -ForegroundColor Green
    $frontendBuildArgs = @()
    if ($NoCacheFrontend) { $frontendBuildArgs += "--no-cache" }
    
    & docker build @frontendBuildArgs `
        -t "chip-tracker-frontend:$ImageTag" `
        -f src/frontend/Dockerfile `
        src/frontend
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Frontend build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Frontend image built successfully" -ForegroundColor Green
}

Write-Host "`n✨ Docker images built successfully!" -ForegroundColor Cyan
Write-Host "Run 'docker-compose up' to start the services" -ForegroundColor Gray

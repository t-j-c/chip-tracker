# Docker run script for Chip Tracker
# Usage: ./docker-run.ps1 [command]

param(
    [string]$Command = "up",
    [switch]$Detached,
    [switch]$Rebuild
)

$env:COMPOSE_DOCKER_CLI_BUILD = "1"
$env:DOCKER_BUILDKIT = "1"

switch ($Command) {
    "up" {
        Write-Host "🚀 Starting Chip Tracker services..." -ForegroundColor Cyan
        $args = @("-f", "docker-compose.yml")
        if ($Rebuild) { $args += "--build" }
        if ($Detached) { $args += "-d" }
        
        & docker-compose @args up
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✅ Services started successfully!" -ForegroundColor Green
            Write-Host "Frontend: http://localhost:3000" -ForegroundColor Gray
            Write-Host "Backend: http://localhost:5000" -ForegroundColor Gray
        } else {
            Write-Host "❌ Failed to start services" -ForegroundColor Red
        }
    }
    
    "down" {
        Write-Host "🛑 Stopping Chip Tracker services..." -ForegroundColor Cyan
        & docker-compose down
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Services stopped successfully!" -ForegroundColor Green
        }
    }
    
    "logs" {
        Write-Host "📋 Showing service logs..." -ForegroundColor Cyan
        & docker-compose logs -f
    }
    
    "build" {
        Write-Host "🔨 Building Docker images..." -ForegroundColor Cyan
        & docker-compose build
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Images built successfully!" -ForegroundColor Green
        }
    }
    
    "ps" {
        Write-Host "📊 Service status:" -ForegroundColor Cyan
        & docker-compose ps
    }
    
    default {
        Write-Host "Unknown command: $Command" -ForegroundColor Red
        Write-Host "`nAvailable commands:" -ForegroundColor Cyan
        Write-Host "  up [--Detached] [--Rebuild]  Start services" -ForegroundColor Gray
        Write-Host "  down                         Stop services" -ForegroundColor Gray
        Write-Host "  logs                         Show logs" -ForegroundColor Gray
        Write-Host "  build                        Build images" -ForegroundColor Gray
        Write-Host "  ps                           Show service status" -ForegroundColor Gray
    }
}

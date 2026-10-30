#!/usr/bin/env pwsh
# Publishes the API and WebSocket-connect Lambda bundles (linux-arm64, ReadyToRun) to artifacts/lambda/.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$out = Join-Path $root 'artifacts/lambda'

$targets = @(
    @{ Project = 'src/backend/src/ChipTracker.Presentation'; Output = 'api' },
    @{ Project = 'src/backend/src/ChipTracker.WsConnect'; Output = 'ws-connect' }
)

foreach ($t in $targets) {
    $dest = Join-Path $out $t.Output
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    dotnet publish (Join-Path $root $t.Project) -c Release -r linux-arm64 --self-contained false `
        -p:PublishReadyToRun=true -p:LambdaPublish=true -o $dest
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed for $($t.Project)" }
}

Write-Host "Lambda bundles written to $out"

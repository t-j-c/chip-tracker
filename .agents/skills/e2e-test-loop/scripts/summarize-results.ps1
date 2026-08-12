<#
.SYNOPSIS
  Compress a Playwright JSON report into a few lines of agent-readable output.

.DESCRIPTION
  Prints one line per failing/flaky test:
      FAIL  <file>:<line>  <title>  | <first error line>
  plus a single STATS line. Designed to keep e2e triage cheap in tokens.

.PARAMETER Path
  Path to the Playwright JSON report. Default: results.json in the current directory.

.PARAMETER Detail
  Emit the full error message (and code frame if present) instead of the first line.

.PARAMETER Grep
  Only report tests whose title or file matches this substring.
#>
param(
    [string]$Path = 'results.json',
    [switch]$Detail,
    [string]$Grep
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Path)) {
    Write-Output "NO-REPORT $Path not found (did the run write --reporter=json?)"
    exit 2
}

$report = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json

function Remove-Ansi([string]$s) {
    if (-not $s) { return '' }
    return [regex]::Replace($s, "`e\[[0-9;]*[A-Za-z]", '')
}

$specs = [System.Collections.Generic.List[object]]::new()
function Get-Specs($suite) {
    if ($null -eq $suite) { return }
    foreach ($s in @($suite.specs | Where-Object { $_ })) { $specs.Add($s) }
    foreach ($child in @($suite.suites | Where-Object { $_ })) { Get-Specs $child }
}
foreach ($suite in @($report.suites | Where-Object { $_ })) { Get-Specs $suite }

$rows = 0
foreach ($spec in $specs) {
    foreach ($test in @($spec.tests)) {
        if ($test.status -eq 'expected' -or $test.status -eq 'skipped') { continue }

        $file = $spec.file
        $title = $spec.title
        if ($Grep -and ($title -notlike "*$Grep*") -and ($file -notlike "*$Grep*")) { continue }

        $last = @($test.results)[-1]
        $msg = Remove-Ansi $last.error.message
        $tag = if ($test.status -eq 'flaky') { 'FLAKY' } else { 'FAIL ' }

        if ($Detail) {
            Write-Output "$tag $file`:$($spec.line)  $title"
            Write-Output $msg
            if ($last.error.snippet) { Write-Output (Remove-Ansi $last.error.snippet) }
            Write-Output ''
        }
        else {
            $first = ($msg -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
            Write-Output "$tag $file`:$($spec.line)  $title  | $first"
        }
        $rows++
    }
}

foreach ($e in @($report.errors)) {
    Write-Output ("GLOBAL " + ((Remove-Ansi $e.message) -split "`r?`n" | Select-Object -First 1))
    $rows++
}

$st = $report.stats
Write-Output "STATS passed=$($st.expected) failed=$($st.unexpected) flaky=$($st.flaky) skipped=$($st.skipped)"
if ($rows -eq 0 -and -not $Grep -and $st.unexpected -eq 0 -and $st.flaky -eq 0) { Write-Output 'GREEN' }

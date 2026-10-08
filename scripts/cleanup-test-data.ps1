param([ValidateSet('preflight', 'apply-schema-and-cleanup')][string]$Action = 'preflight')
$ErrorActionPreference = 'Stop'
# Run only inside the configured production environment. No credentials on the command line.
$previousAction = $env:EVERLOOT_MAINTENANCE_ACTION
Push-Location (Join-Path $PSScriptRoot '../web')
try {
    $env:EVERLOOT_MAINTENANCE_ACTION = $Action
    & node --import=tsx scripts/launch-maintenance.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Everloot maintenance failed; inspect the operation log' }
} finally {
    $env:EVERLOOT_MAINTENANCE_ACTION = $previousAction
    Pop-Location
}

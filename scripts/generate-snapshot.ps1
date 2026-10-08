param(
    [Parameter(Mandatory = $true)][string]$SourceDb,
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$kbDir = Join-Path $PSScriptRoot '../kb'
Push-Location $kbDir
try {
    if (-not (Test-Path -LiteralPath $SourceDb -PathType Leaf)) { throw 'Source database not found' }
    if (Test-Path -LiteralPath "$SourceDb.manifest.json") { throw 'Source must be a working knowledge database, never a public release' }
    if (Test-Path -LiteralPath $OutputPath) { throw 'Refusing to replace an existing public release' }
    & node './node_modules/tsx/dist/cli.mjs' src/cli.ts snapshot $OutputPath --db $SourceDb
    if ($LASTEXITCODE -ne 0) { throw 'Snapshot export failed' }
    # serve-mcp opens and validates the immutable release; EOF ends the smoke check.
    '' | & node './node_modules/tsx/dist/cli.mjs' src/cli.ts serve-mcp --db $OutputPath
    if ($LASTEXITCODE -ne 0) { throw 'Snapshot validation failed' }
    Write-Host "Validated public release: $OutputPath"
} finally { Pop-Location }

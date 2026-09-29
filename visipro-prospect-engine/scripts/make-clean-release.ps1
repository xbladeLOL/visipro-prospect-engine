param([string]$Destination = "release/visipro-prospect-engine")
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dest = [System.IO.Path]::GetFullPath((Join-Path $root $Destination))
if (-not $dest.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Destination must stay inside project" }
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest | Out-Null
$items = @("src","migrations","scripts","installer.sh","recherche.sh","Dockerfile","docker-compose.yml","package.json","package-lock.json","tsconfig.json",".env.example",".dockerignore",".gitignore","README.md")
foreach ($item in $items) { $source=Join-Path $root $item; if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $dest -Recurse } }
Write-Host "Clean release created at $dest"

# build.ps1
# Builds the sovf TaskNotes extension plugin and copies the build artifacts
# into the Obsidian vault's .obsidian/plugins directory so it is installed in place.
#
# Usage:
#   .\build.ps1                 # install deps if missing, build, copy
#   .\build.ps1 -CopyOnly       # skip build, only copy existing artifacts
#   .\build.ps1 -SkipInstall    # build but do not npm install even if node_modules missing
#   .\build.ps1 -Vault <path>   # override the Obsidian vault root for the copy step

param([switch]$CopyOnly, [switch]$SkipInstall, [string]$Vault)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$PluginId = "tasknotes-plugin-sovf"

# Where the built artifacts live inside the project (esbuild writes to ./ main.js, etc.).
$Artifacts = @("main.js", "manifest.json", "versions.json")

# Default Obsidian vault location for the sovf user; overridable via -Vault or env.
$VaultPluginsDir = if ($Vault) {
	Join-Path $Vault ".obsidian\plugins"
} elseif ($env:OBSIDIAN_VAULT_PATH) {
	Join-Path $env:OBSIDIAN_VAULT_PATH ".obsidian\plugins"
} else {
	"C:\Users\sovf\Documents\Obsidian Vault\.obsidian\plugins"
}
$PluginDir = Join-Path $VaultPluginsDir $PluginId

Set-Location $ProjectRoot

function Write-Step($Message) {
	Write-Host ""; Write-Host ">> $Message" -ForegroundColor Cyan
}

if (-not $CopyOnly) {
	# --- 1. Install dependencies (only when node_modules is missing) ---
	if ((-not $SkipInstall) -and -not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
		Write-Step "Installing npm dependencies..."
		npm install
		if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
	}

	# --- 2. Build (typecheck + esbuild production bundle) ---
	Write-Step "Running production build (npm run build) ..."
	npm run build
	if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
}

# --- 3. Verify build artifacts exist in the project root ---
foreach ($f in $Artifacts) {
	$p = Join-Path $ProjectRoot $f
	if (-not (Test-Path $p)) {
			throw "Required artifact '$f' not found in $ProjectRoot. Did the build run successfully?"
	}
}

# --- 4. Copy artifacts into the Obsidian vault plugins folder ---
Write-Step "Copying artifacts to $PluginDir ..."
New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
foreach ($f in $Artifacts) {
	Copy-Item -Force (Join-Path $ProjectRoot $f) (Join-Path $PluginDir $f)
	Write-Host "  copied $f"
}

Write-Host ""
Write-Host "Done. Restart (or reload) Obsidian to pick up the plugin in '$VaultPluginsDir\$PluginId'." -ForegroundColor Green
pwsh
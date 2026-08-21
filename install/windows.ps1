#Requires -Version 5.1
<#
.SYNOPSIS
  Install or update Node.js (latest LTS if needed) and the langflower CLI.
.DESCRIPTION
  Self-contained Windows installer. Download and run this file alone.
#>
$ErrorActionPreference = 'Stop'

$MinNodeVersion = [version]'22.22.3'

function Write-Info([string]$Message) {
	Write-Host "[langflower-install] $Message"
}

function Write-Err([string]$Message) {
	Write-Host "[langflower-install] ERROR: $Message" -ForegroundColor Red
}

function Refresh-Path {
	$machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
	$user = [Environment]::GetEnvironmentVariable('Path', 'User')
	$env:Path = @($machine, $user) -join ';'
}

function Test-NodeMeetsMinimum {
	Refresh-Path
	$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
	if (-not $nodeCmd) {
		return $false
	}
	try {
		$raw = (& node -v 2>$null)
		if (-not $raw) {
			return $false
		}
		$ver = [version]($raw.Trim().TrimStart('v'))
		return $ver -ge $MinNodeVersion
	} catch {
		return $false
	}
}

function Install-NodeLts {
	$winget = Get-Command winget -ErrorAction SilentlyContinue
	if (-not $winget) {
		Write-Err 'winget was not found. Install App Installer from the Microsoft Store, or install Node.js LTS from https://nodejs.org/ and re-run this script.'
		exit 1
	}

	Write-Info 'Installing latest Node.js LTS via winget (OpenJS.NodeJS.LTS)...'
	& winget install --id OpenJS.NodeJS.LTS -e `
		--accept-package-agreements `
		--accept-source-agreements
	if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
		# -1978335189 = already installed (winget)
		Write-Err "winget install failed with exit code $LASTEXITCODE."
		exit 1
	}

	Refresh-Path
	if (-not (Test-NodeMeetsMinimum)) {
		Write-Err "Node.js is still missing or below $MinNodeVersion after winget install. Open a new terminal and re-run this script, or install from https://nodejs.org/."
		exit 1
	}
}

function Get-GlobalLangflowerVersion {
	try {
		$jsonText = & npm list -g --depth=0 --json 2>$null
		if (-not $jsonText) {
			return $null
		}
		$json = $jsonText | ConvertFrom-Json
		$dep = $json.dependencies.langflower
		if ($null -eq $dep) {
			return $null
		}
		return [string]$dep.version
	} catch {
		return $null
	}
}

function Ensure-Langflower {
	$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
	if (-not $npmCmd) {
		Write-Err 'npm was not found on PATH after ensuring Node.js.'
		exit 1
	}

	$local = Get-GlobalLangflowerVersion
	if (-not $local) {
		Write-Info 'Installing langflower globally (npm install -g langflower)...'
		& npm install -g langflower
		if ($LASTEXITCODE -ne 0) {
			Write-Err 'npm install -g langflower failed.'
			exit 1
		}
		return
	}

	Write-Info "langflower $local is installed; checking npm registry..."
	$remote = (& npm view langflower version 2>$null)
	if (-not $remote) {
		Write-Err 'Could not read langflower version from the npm registry.'
		exit 1
	}
	$remote = $remote.Trim()

	if ($remote -eq $local) {
		Write-Info "langflower $local is already up to date."
		return
	}

	Write-Info "Updating langflower $local -> $remote..."
	& npm install -g langflower@latest
	if ($LASTEXITCODE -ne 0) {
		Write-Err 'npm install -g langflower@latest failed.'
		exit 1
	}
}

Write-Info 'Langflower Windows installer'
Write-Info "Minimum Node.js: $MinNodeVersion (installs latest LTS if needed)"

if (Test-NodeMeetsMinimum) {
	$current = (& node -v).Trim()
	Write-Info "Node.js $current already meets the minimum; skipping Node install."
} else {
	Write-Info "Node.js missing or below $MinNodeVersion."
	Install-NodeLts
}

Ensure-Langflower
Refresh-Path

$nodeVer = (& node -v).Trim()
$npmVer = (& npm -v).Trim()
$lfVer = Get-GlobalLangflowerVersion
if (-not $lfVer) {
	$lfVer = '(unknown)'
}

Write-Host ''
Write-Info "Done. node $nodeVer | npm $npmVer | langflower $lfVer"
Write-Info 'Start with:  langflower'
Write-Info 'Or:          langflower ./my-project'
exit 0

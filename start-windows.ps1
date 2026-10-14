$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24.19+ from nodejs.org, then try again.' }
& node scripts/check-runtime.mjs
if ($LASTEXITCODE -ne 0) { throw 'Runtime checks failed. Install an official Node.js 24.19+ build with SQLite FTS5.' }
if (-not (Test-Path '.venv/Scripts/python.exe')) {
  if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv .venv } else { & python -m venv .venv }
  if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11+ with venv support.' }
}
& ./.venv/Scripts/python.exe -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ is required"'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
$requirementsChanged = -not (Test-Path '.venv/evidarium-requirements.txt')
if (-not $requirementsChanged) { $requirementsChanged = (Get-FileHash companion/requirements.txt).Hash -ne (Get-FileHash .venv/evidarium-requirements.txt).Hash }
if ($requirementsChanged) {
  Write-Host 'Installing the Python packages listed in companion/requirements.txt in this folder’s virtual environment.'
  & ./.venv/Scripts/python.exe -m pip install -r companion/requirements.txt
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Review the preceding error.' }
  Copy-Item companion/requirements.txt .venv/evidarium-requirements.txt
}
if (-not (Test-Path 'dist-local/index.html')) { throw 'Build the source checkout using pnpm install --frozen-lockfile and pnpm build:local, or use the prebuilt local download.' }
& node companion/server.mjs

#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
command -v node >/dev/null || { echo 'Install Node.js 24.19 or newer from nodejs.org, then run again.'; exit 1; }
node scripts/check-runtime.mjs
command -v python3 >/dev/null || { echo 'Install Python 3.11+ from python.org, then run again.'; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ is required"'
if [ ! -f .venv/bin/python ]; then python3 -m venv .venv; fi
if ! cmp -s companion/requirements.txt .venv/evidarium-requirements.txt; then
  echo 'Installing the Python packages listed in companion/requirements.txt into this folder’s virtual environment.'
  .venv/bin/python -m pip install -r companion/requirements.txt
  cp companion/requirements.txt .venv/evidarium-requirements.txt
fi
if [ ! -f dist-local/index.html ]; then echo 'Build the source checkout first: pnpm install --frozen-lockfile && pnpm build:local. The downloadable local release is already built.'; exit 1; fi
exec node companion/server.mjs

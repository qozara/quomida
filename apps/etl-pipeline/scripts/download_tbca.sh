#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_DIR="${SCRIPT_DIR}/../data/raw"

echo "==> Preparing TBCA dataset directory..."
mkdir -p "${RAW_DIR}/tbca"

TBCA_URL="YOUR_TBCA_URL_HERE"

if [[ "${TBCA_URL}" == "YOUR_"* ]]; then
  echo "[!] ERROR: URL for TBCA is not configured."
  echo "    Please update the script with a valid URL or disable include_tbca in the CI workflow."
  exit 1
fi

echo "==> Downloading TBCA..."
curl -L -f -sS --retry 3 -o "${RAW_DIR}/tbca/tbca.csv" "${TBCA_URL}" || {
  echo "[!] FATAL ERROR: Failed to download TBCA from ${TBCA_URL}."
  echo "    The file may be inaccessible, or the URL might be outdated."
  exit 1
}

echo "==> TBCA dataset downloaded successfully!"

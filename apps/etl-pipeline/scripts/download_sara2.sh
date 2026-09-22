#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_DIR="${SCRIPT_DIR}/../data/raw"

echo "==> Preparing SARA2 dataset directory..."
mkdir -p "${RAW_DIR}/sara2"

SARA2_URL="YOUR_SARA2_URL_HERE"

if [[ "${SARA2_URL}" == "YOUR_"* ]]; then
  echo "[!] ERROR: URL for SARA2 is not configured."
  echo "    Please update the script with a valid URL or disable include_sara2 in the CI workflow."
  exit 1
fi

echo "==> Downloading SARA2..."
curl -L -f -sS --retry 3 -o "${RAW_DIR}/sara2/sara2.csv" "${SARA2_URL}" || {
  echo "[!] FATAL ERROR: Failed to download SARA2 from ${SARA2_URL}."
  echo "    The file may be inaccessible, or the URL might be outdated."
  exit 1
}

echo "==> SARA2 dataset downloaded successfully!"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_DIR="${SCRIPT_DIR}/../data/raw"

echo "==> Preparing regional dataset directories..."
mkdir -p "${RAW_DIR}/argenfoods"
mkdir -p "${RAW_DIR}/sara2"
mkdir -p "${RAW_DIR}/tbca"

# ---------------------------------------------------------
# TO THE MAINTAINER:
# Insert the actual direct download URLs (e.g., from AWS S3, Cloudflare R2, or a raw GitHub gist)
# for the regional CSV files below. If you prefer to track these small CSVs in git directly,
# you can simply delete this script and remove it from the GitHub Actions workflow.
# ---------------------------------------------------------

ARGENFOODS_URL="YOUR_ARGENFOODS_CSV_URL_HERE"
SARA2_URL="YOUR_SARA2_CSV_URL_HERE"
TBCA_URL="YOUR_TBCA_CSV_URL_HERE"

download_csv() {
  local url=$1
  local dest=$2
  local name=$3

  if [[ "${url}" == "YOUR_"* ]]; then
    echo "[!] ERROR: URL for ${name} is not configured."
    echo "    Please update the script with a valid URL or disable include_regional in the CI workflow."
    exit 1
  fi

  echo "==> Downloading ${name}..."
  # -f: HTTP fail fast
  # -sS: Silent but show errors
  # --retry: Robustness against transient network drops
  curl -L -f -sS --retry 3 -o "${dest}" "${url}" || {
    echo "[!] FATAL ERROR: Failed to download ${name} from ${url}."
    echo "    The file may be inaccessible, or the URL might be outdated."
    exit 1
  }
}

download_csv "${ARGENFOODS_URL}" "${RAW_DIR}/argenfoods/argenfoods.csv" "ARGENFOODS"
download_csv "${SARA2_URL}" "${RAW_DIR}/sara2/sara2.csv" "SARA 2"
download_csv "${TBCA_URL}" "${RAW_DIR}/tbca/tbca.csv" "TBCA"

echo "==> Regional datasets step complete!"

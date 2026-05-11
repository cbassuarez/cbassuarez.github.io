#!/usr/bin/env bash
# Install the TMAYD cloud poller. Run on the OptiPlex (tmayd-bridge) as the
# `seb` user. Will sudo to install root-owned config + systemd unit.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE_DIR="${REPO_ROOT}/optiplex"

if [[ "$(hostname)" != "tmayd-bridge"* ]]; then
  echo "warn: this script is intended for the OptiPlex (hostname tmayd-bridge*)" >&2
fi

if [[ ! -f "${STAGE_DIR}/cloud-poller.py" || ! -f "${STAGE_DIR}/tmayd-cloud-poller.service" ]]; then
  echo "error: missing payload files in ${STAGE_DIR}" >&2
  exit 1
fi

if [[ ! -f /etc/tmayd/cloud.env ]]; then
  echo "error: /etc/tmayd/cloud.env not present" >&2
  echo "       copy ops/optiplex/cloud.env.example to /etc/tmayd/cloud.env," >&2
  echo "       set TMAYD_BRIDGE_TOKEN, chmod 600, then re-run." >&2
  exit 2
fi

echo "[1/4] copying cloud-poller.py to /opt/tmayd/bin/"
install -m 0755 -o seb -g seb "${STAGE_DIR}/cloud-poller.py" /opt/tmayd/bin/cloud-poller.py

echo "[2/4] installing systemd unit"
sudo install -m 0644 -o root -g root "${STAGE_DIR}/tmayd-cloud-poller.service" /etc/systemd/system/tmayd-cloud-poller.service

echo "[3/4] ensuring cloud state directory"
mkdir -p /var/lib/tmayd/cloud
chmod 0755 /var/lib/tmayd/cloud

echo "[4/4] enabling + starting tmayd-cloud-poller.service"
sudo systemctl daemon-reload
sudo systemctl enable tmayd-cloud-poller.service
sudo systemctl restart tmayd-cloud-poller.service

echo "--- recent logs ---"
sleep 2
sudo journalctl -u tmayd-cloud-poller -n 20 --no-pager || true

echo "--- done. health check ---"
systemctl is-active tmayd-cloud-poller.service

#!/usr/bin/env bash
# Install the TMAYD cloud poller and the status-light service. Run on the
# OptiPlex (tmayd-bridge) as the `seb` user. Will sudo to install root-owned
# config + systemd units.

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

HAS_LIGHT=0
if [[ -f "${STAGE_DIR}/status-light.py" && -f "${STAGE_DIR}/tmayd-status-light.service" ]]; then
  HAS_LIGHT=1
  if [[ ! -f /etc/tmayd/light.env ]]; then
    echo "error: /etc/tmayd/light.env not present" >&2
    echo "       copy ops/optiplex/light.env.example to /etc/tmayd/light.env," >&2
    echo "       then re-run." >&2
    exit 2
  fi
fi

echo "[1/6] copying cloud-poller.py + print-queue.py to /opt/tmayd/bin/"
install -m 0755 -o seb -g seb "${STAGE_DIR}/cloud-poller.py" /opt/tmayd/bin/cloud-poller.py
# print-queue.py is staged in the repo for source-of-truth tracking; install
# only if it's present (older checkouts won't have it).
if [[ -f "${STAGE_DIR}/print-queue.py" ]]; then
  install -m 0755 -o seb -g seb "${STAGE_DIR}/print-queue.py" /opt/tmayd/bin/print-queue.py
fi

echo "[2/6] installing tmayd-cloud-poller systemd unit"
sudo install -m 0644 -o root -g root "${STAGE_DIR}/tmayd-cloud-poller.service" /etc/systemd/system/tmayd-cloud-poller.service

echo "[3/6] ensuring local state directories"
mkdir -p /var/lib/tmayd/cloud /var/lib/tmayd/status
chmod 0755 /var/lib/tmayd/cloud /var/lib/tmayd/status

if [[ "${HAS_LIGHT}" -eq 1 ]]; then
  echo "[4/6] preparing status-light venv (/opt/tmayd/venv-light) + installing lifxlan"
  if [[ ! -x /opt/tmayd/venv-light/bin/python ]]; then
    sudo install -d -o seb -g seb /opt/tmayd/venv-light
    python3 -m venv /opt/tmayd/venv-light
  fi
  /opt/tmayd/venv-light/bin/pip install --quiet --upgrade pip
  /opt/tmayd/venv-light/bin/pip install --quiet lifxlan

  echo "[5/6] installing status-light.py + tmayd-status-light.service"
  install -m 0755 -o seb -g seb "${STAGE_DIR}/status-light.py" /opt/tmayd/bin/status-light.py
  sudo install -m 0644 -o root -g root "${STAGE_DIR}/tmayd-status-light.service" /etc/systemd/system/tmayd-status-light.service
else
  echo "[4/6] status-light payload not present in ${STAGE_DIR}; skipping"
  echo "[5/6] status-light unit not installed; skipping"
fi

echo "[6/6] reloading systemd + restarting units"
sudo systemctl daemon-reload
sudo systemctl enable tmayd-cloud-poller.service
sudo systemctl restart tmayd-cloud-poller.service
if [[ "${HAS_LIGHT}" -eq 1 ]]; then
  sudo systemctl enable tmayd-status-light.service
  sudo systemctl restart tmayd-status-light.service
fi

echo "--- recent logs ---"
sleep 2
sudo journalctl -u tmayd-cloud-poller -n 15 --no-pager || true
if [[ "${HAS_LIGHT}" -eq 1 ]]; then
  sudo journalctl -u tmayd-status-light -n 15 --no-pager || true
fi

echo "--- done. health check ---"
systemctl is-active tmayd-cloud-poller.service
if [[ "${HAS_LIGHT}" -eq 1 ]]; then
  systemctl is-active tmayd-status-light.service
fi

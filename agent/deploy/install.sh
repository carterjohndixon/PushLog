#!/bin/sh
set -e

# PushLog Agent installer
# Usage: curl -fsSL https://pushlog.ai/install.sh | sh

INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/pushlog-agent"
SPOOL_DIR="/var/lib/pushlog-agent/spool"
SERVICE_FILE="/etc/systemd/system/pushlog-agent.service"
BINARY="pushlog-agent"
BASE_URL="https://github.com/pushlog-ai/PushLog/releases/latest/download"

echo "==> PushLog Agent installer"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" != "linux" ]; then
  echo "Error: Only Linux is supported (detected: $OS)"
  exit 1
fi

echo "==> Detected: ${OS}/${ARCH}"

# Download binary
DOWNLOAD_URL="${BASE_URL}/${BINARY}-${OS}-${ARCH}"
echo "==> Downloading ${DOWNLOAD_URL}"
curl -fsSL -o "/tmp/${BINARY}" "${DOWNLOAD_URL}"
chmod +x "/tmp/${BINARY}"

# Install binary
echo "==> Installing to ${INSTALL_DIR}/${BINARY}"
sudo mv "/tmp/${BINARY}" "${INSTALL_DIR}/${BINARY}"

# Create directories
echo "==> Creating directories"
sudo mkdir -p "${CONFIG_DIR}"
sudo mkdir -p "${SPOOL_DIR}"

# Install systemd service (only if not already present)
if [ ! -f "${SERVICE_FILE}" ]; then
  echo "==> Installing systemd service"
  sudo tee "${SERVICE_FILE}" > /dev/null << 'UNIT'
[Unit]
Description=PushLog Agent — server log collector
Documentation=https://pushlog.ai/docs/agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/pushlog-agent run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pushlog-agent
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=/var/lib/pushlog-agent /var/run
ReadOnlyPaths=/etc/pushlog-agent
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
else
  echo "==> Systemd service already exists, skipping"
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Connect your agent:"
echo "     sudo pushlog-agent connect --token plg_YOUR_TOKEN --endpoint https://YOUR_PUSHLOG_URL"
echo ""
echo "  2. Edit config to add sources:"
echo "     sudo nano ${CONFIG_DIR}/config.yaml"
echo ""
echo "  3. Test connectivity:"
echo "     sudo pushlog-agent test"
echo ""
echo "  4. Start the service:"
echo "     sudo systemctl enable --now pushlog-agent"

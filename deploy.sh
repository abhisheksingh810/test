#!/bin/bash
set -e

echo "🚀 Deploying migration service..."

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="rogo-migration"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
USER=$(whoami)

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create systemd service file
echo "📝 Creating systemd service..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Rogo Submissions Migration Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run migrate:rogo
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "✅ Enabling service to start on boot..."
sudo systemctl enable "$SERVICE_NAME"

echo "🎉 Deployment complete!"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start $SERVICE_NAME"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"


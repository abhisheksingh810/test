#!/bin/bash
set -e

echo "🚀 Deploying migration service..."

# Get script directory and project root (absolute paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="rogo-migration"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/migration-$(date +%Y%m%d-%H%M%S).log"
USER=$(whoami)

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p "$LOG_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create wrapper script for logging
echo "📝 Creating migration wrapper script..."
WRAPPER_SCRIPT="$SCRIPT_DIR/run-migration.sh"
cat > "$WRAPPER_SCRIPT" <<'WRAPPER_EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/migration-$(date +%Y%m%d-%H%M%S).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Run migration and log everything
cd "$PROJECT_DIR"
npm run migrate:rogo:parallel >> "$LOG_FILE" 2>&1
WRAPPER_EOF

chmod +x "$WRAPPER_SCRIPT"

# Create systemd service file
echo "📝 Creating systemd service..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Rogo Submissions Migration Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$WRAPPER_SCRIPT
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/migration-service.log
StandardError=append:$LOG_DIR/migration-service-error.log

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service file created with:"
echo "   WorkingDirectory: $PROJECT_DIR"
echo "   Log directory: $LOG_DIR"

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
echo ""
echo "Log files:"
echo "  Timestamped log:  tail -f $LOG_DIR/migration-*.log (latest)"
echo "  Service log:      tail -f $LOG_DIR/migration-service.log"
echo "  Error log:        tail -f $LOG_DIR/migration-service-error.log"
echo ""
echo "📝 To monitor migration progress in real-time:"
echo "   tail -f \$(ls -t $LOG_DIR/migration-*.log | head -1)"
echo ""
echo "📊 To view latest log file:"
echo "   ls -lt $LOG_DIR/migration-*.log | head -1"


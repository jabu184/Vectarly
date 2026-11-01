#!/usr/bin/env bash
set -e

# ==========================================
# Vectarly - Oracle Cloud VM Remote Deploy
# ==========================================

TARGET_PORT="${1:-3003}"
APP_DIR="${2:-$(pwd)}"
TARBALL="vectarly.tar.gz"

echo "=========================================="
echo "🚀 Deploying Vectarly to Oracle Cloud VM"
echo "📂 App Directory: $APP_DIR"
echo "🔌 Target Port:   $TARGET_PORT"
echo "=========================================="

cd "$APP_DIR"

# 1. Unpack application tarball if present
if [ -f "$TARBALL" ]; then
  echo "📦 Unpacking $TARBALL..."
  tar -xzf "$TARBALL"
  rm -f "$TARBALL"
fi

# 2. Ensure persistent data directory and permissions
echo "📁 Setting up persistent storage..."
mkdir -p data
chmod 777 data

# 3. Configure Oracle Ubuntu OS firewall (iptables)
# Oracle Ubuntu images have a default REJECT rule at the end of INPUT chain.
# Inserting at position 1 guarantees traffic reaches the port before REJECT.
echo "🛡️  Configuring iptables firewall for port $TARGET_PORT..."
if ! sudo iptables -C INPUT -p tcp --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport "$TARGET_PORT" -j ACCEPT
  echo "   [✓] Added iptables rule for port $TARGET_PORT"
else
  echo "   [i] iptables rule for port $TARGET_PORT already exists"
fi

# Persist iptables rules across reboots
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save
  echo "   [✓] Saved iptables rules via netfilter-persistent"
else
  echo "   [i] netfilter-persistent not found; rules active for current session"
fi

# 4. Rebuild and launch the container
echo "🐳 Building and launching container..."
export PORT="$TARGET_PORT"

if docker compose version >/dev/null 2>&1; then
  docker compose down --remove-orphans || true
  docker compose up -d --build
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose down --remove-orphans || true
  docker-compose up -d --build
else
  echo "❌ Error: Neither 'docker compose' nor 'docker-compose' found on this server."
  echo "   Please install Docker & Docker Compose plugin first: sudo apt-get install -y docker-compose-v2"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ Vectarly successfully deployed!"
echo "🌐 Container running on port $TARGET_PORT"
echo "=========================================="
docker ps --filter "name=vectarly"

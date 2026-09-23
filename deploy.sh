#!/usr/bin/env bash
# ==============================================================================
# deploy.sh - Production Deployment Script for Debt Management Application
# Target Domain: debt.jaymayu.com
# Platform: DigitalOcean Droplet with Docker Compose & Traefik Reverse Proxy
# ==============================================================================

set -euo pipefail

# Text formatting
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Resolve directory of this script to run commands from repo root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_DIR}"

echo -e "${BOLD}======================================================${NC}"
echo -e "${BOLD}  Debt Management Application - Deployment Script     ${NC}"
echo -e "${BOLD}  Target: https://debt.jaymayu.com                    ${NC}"
echo -e "${BOLD}======================================================${NC}\n"

# 1. Check Docker installation
info "Checking Docker and Docker Compose installation..."

if ! command -v docker >/dev/null 2>&1; then
  error "Docker is not installed or not in PATH."
  echo "Please install Docker on your Droplet:"
  echo "  sudo apt-get update && sudo apt-get install -y docker.io"
  exit 1
fi

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  error "Neither 'docker compose' (plugin) nor 'docker-compose' (standalone) was found."
  echo "Please install Docker Compose plugin:"
  echo "  sudo apt-get update && sudo apt-get install -y docker-compose-plugin"
  exit 1
fi

success "Docker and Docker Compose (${COMPOSE_CMD}) are installed."

# Check if Docker daemon is responsive
if ! docker info >/dev/null 2>&1; then
  error "Docker daemon is not running or current user lacks socket permissions."
  echo "Try starting the Docker service: sudo systemctl start docker"
  echo "Or add user to docker group:     sudo usermod -aG docker \$USER && newgrp docker"
  exit 1
fi

# 2. Ensure external Docker network 'web' exists (required by Traefik)
info "Checking Docker external network 'web'..."
if ! docker network inspect web >/dev/null 2>&1; then
  info "External network 'web' not found. Creating network 'web'..."
  docker network create web
  success "External network 'web' created successfully."
else
  success "External network 'web' is present."
fi

# 3. Ensure ./data directory exists with proper permissions
info "Verifying persistent storage directory (./data)..."
DATA_DIR="${REPO_DIR}/data"
if [ ! -d "${DATA_DIR}" ]; then
  info "Creating data directory: ${DATA_DIR}"
  mkdir -p "${DATA_DIR}"
fi
chmod 755 "${DATA_DIR}"
success "Data directory ready at ${DATA_DIR}."

# 4. Check environment configuration (.env)
info "Checking environment configuration (.env)..."
ENV_FILE="${REPO_DIR}/.env"
ENV_EXAMPLE="${REPO_DIR}/.env.example"

if [ ! -f "${ENV_FILE}" ]; then
  warn ".env file not found. Initializing from ${ENV_EXAMPLE}..."
  if [ -f "${ENV_EXAMPLE}" ]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  else
    cat <<'EOF' > "${ENV_FILE}"
AUTH_PASSWORD=
SESSION_SECRET=
BASE_CURRENCY=USD
PORT=3000
DB_PATH=/app/data/budget.db
EOF
  fi

  # Auto-populate random session secret if empty
  SESSION_SECRET_GEN=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 64 || true)
  if [ -n "${SESSION_SECRET_GEN}" ]; then
    if grep -q "^SESSION_SECRET=" "${ENV_FILE}"; then
      sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET_GEN}|" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"
    fi
  fi

  # Prompt user for master password if running interactively
  USER_PASS=""
  if [ -t 0 ]; then
    echo -e "${YELLOW}Enter master password for dashboard authentication:${NC}"
    read -r -s -p "AUTH_PASSWORD: " USER_PASS
    echo ""
  fi

  if [ -n "${USER_PASS}" ]; then
    ESCAPED_PASS=$(printf '%s\n' "${USER_PASS}" | sed -e 's/[|&\\]/\\&/g')
    sed -i.bak "s|^AUTH_PASSWORD=.*|AUTH_PASSWORD=${ESCAPED_PASS}|" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"
    success "Configured master password in .env."
  else
    # Auto-generate a secure random password if non-interactive or left blank
    AUTO_PASS=$(openssl rand -base64 16 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9!@#$' | head -c 20 || true)
    if [ -n "${AUTO_PASS}" ]; then
      ESCAPED_AUTO_PASS=$(printf '%s\n' "${AUTO_PASS}" | sed -e 's/[|&\\]/\\&/g')
      sed -i.bak "s|^AUTH_PASSWORD=.*|AUTH_PASSWORD=${ESCAPED_AUTO_PASS}|" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"
      warn "Generated random master password: ${AUTO_PASS}"
      warn "You can view or change this password anytime in: ${ENV_FILE}"
    else
      warn "Please edit ${ENV_FILE} and configure AUTH_PASSWORD before accessing the app."
    fi
  fi
else
  success ".env file found."
fi

# Verify AUTH_PASSWORD is not empty or default placeholder
if [ -f "${ENV_FILE}" ]; then
  CURRENT_AUTH=$(grep -E "^AUTH_PASSWORD=" "${ENV_FILE}" | cut -d '=' -f2- || true)
  if [ -z "${CURRENT_AUTH}" ] || [ "${CURRENT_AUTH}" = "change_this_to_a_secure_master_password" ]; then
    warn "AUTH_PASSWORD in ${ENV_FILE} is empty or using the default placeholder!"
    warn "Please set a secure master password in .env before logging into production."
  fi
fi

# 5. Build and launch container stack with Docker Compose
info "Building and launching containers with '${COMPOSE_CMD} up -d --build'..."
${COMPOSE_CMD} up -d --build

# 6. Check container status
echo ""
info "Checking container status..."
${COMPOSE_CMD} ps

# 7. Print verification instructions
echo -e "\n${BOLD}======================================================${NC}"
echo -e "${GREEN}${BOLD}  Deployment Complete!                                ${NC}"
echo -e "${BOLD}======================================================${NC}"
echo -e "Application URL:       ${GREEN}https://debt.jaymayu.com${NC}"
echo -e "Container Name:        ${BOLD}monthly-planner${NC}"
echo -e "Persistent Data:       ${BOLD}${DATA_DIR}/budget.db${NC}"
echo -e "\n${BOLD}Verification Steps:${NC}"
echo -e "1. Verify Traefik routing and SSL certificate:"
echo -e "   curl -IL https://debt.jaymayu.com"
echo -e "2. Check real-time application logs:"
echo -e "   ${COMPOSE_CMD} logs -f monthly-planner"
echo -e "3. Verify container internal health:"
echo -e "   docker exec monthly-planner wget -qO- http://localhost:3000/api/auth/status"
echo -e "4. Access the dashboard in your browser at:"
echo -e "   ${BLUE}https://debt.jaymayu.com${NC}"
echo -e "   Login using the master password configured in ${BOLD}.env${NC}."
echo -e "${BOLD}======================================================${NC}\n"

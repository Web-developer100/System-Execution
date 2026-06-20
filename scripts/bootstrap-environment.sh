#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# V8 Neural Exploitation Platform — Environment Bootstrap
# ---------------------------------------------------------------------------
#
# On first deployment, this script automatically verifies and installs every
# required development environment and runtime.
#
# Supported platforms: Ubuntu/Debian, macOS (Homebrew), RHEL/CentOS/Fedora
#
# It installs and configures:
#   Python 3.x | pip | virtualenv | venv
#   Go | Rust | Cargo | NodeJS LTS | npm | pnpm | Yarn
#   Java JDK | Maven | Gradle | PHP | Composer | Ruby | Bundler | Perl
#   Git | Curl | Wget | GCC | G++ | Build Essential | LLVM | Clang | OpenSSL
#   Docker | Docker Compose | Docker Buildx | Git LFS
#   SQLite | PostgreSQL Client | Redis Client
#   kubectl | Helm | Terraform | AWS CLI | Azure CLI | Google Cloud SDK
#   Nmap | jq | yq | zip | unzip | tar | gzip
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/v8platform/bootstrap/main/init.sh | bash
#   # or locally:
#   sudo bash scripts/bootstrap-environment.sh
#
# Flags:
#   --skip-docker   Skip Docker installation
#   --minimal       Only install essential runtimes (Python, Node, Go, Git)
#   --verbose       Show all output

set -euo pipefail

V8_VERSION="2.1.0"
LOG_FILE="/tmp/v8-bootstrap-$(date +%Y%m%d-%H%M%S).log"
STAGE_FILE="/tmp/v8-bootstrap-stage"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Flags ───────────────────────────────────────────────────────────────────
SKIP_DOCKER=false
MINIMAL=false

for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=true ;;
    --minimal)    MINIMAL=true ;;
    --verbose)    set -x ;;
  esac
done

# ── Utility Functions ────────────────────────────────────────────────────────

log()   { echo -e "${GREEN}[V8]${NC} $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"; }
info()  { echo -e "${CYAN}[INFO]${NC} $*" | tee -a "$LOG_FILE"; }

stage() {
  echo "$1" > "$STAGE_FILE"
  echo -e "\n${CYAN}══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  STAGE ${1}/${TOTAL_STAGES}: $2${NC}"
  echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}\n"
}

require_sudo() {
  if [[ $EUID -ne 0 ]]; then
    error "This script requires root privileges. Re-running with sudo..."
    exec sudo bash "$0" "$@"
  fi
}

command_exists() {
  command -v "$1" &>/dev/null
}

version_gte() {
  # Compare two version strings numerically
  local v1="${1%%-*}" v2="${2%%-*}"
  [ "$(printf '%s\n' "$v1" "$v2" | sort -V | head -n1)" = "$v2" ]
}

install_if_missing() {
  local name="$1" cmd="$2" version_cmd="${3:-}"
  if command_exists "$cmd"; then
    local ver=""
    [[ -n "$version_cmd" ]] && ver=" ($(eval "$version_cmd" 2>/dev/null | head -n1))"
    log "✅ $name$ver — already installed"
    return 0
  fi
  log "⬇️  Installing $name..."
  return 1
}

# ── Detect OS ────────────────────────────────────────────────────────────────

detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ -f /etc/os-release ]]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian|linuxmint|pop) echo "debian" ;;
      rhel|centos|fedora|rocky|almalinux) echo "rhel" ;;
      alpine) echo "alpine" ;;
      *) echo "unknown" ;;
    esac
  else
    echo "unknown"
  fi
}

OS=$(detect_os)
TOTAL_STAGES=$([[ "$MINIMAL" == "true" ]] && echo "4" || echo "10")

# ── System Package Manager ───────────────────────────────────────────────────

PKG_INSTALL=""
PKG_UPDATE=""
case "$OS" in
  debian)
    PKG_UPDATE="apt-get update -qq"
    PKG_INSTALL="apt-get install -y -qq"
    ;;
  rhel)
    PKG_UPDATE="yum check-update -q || true"
    PKG_INSTALL="yum install -y"
    ;;
  macos)
    PKG_INSTALL="brew install"
    ;;
  alpine)
    PKG_UPDATE="apk update -q"
    PKG_INSTALL="apk add -q"
    ;;
  *)
    error "Unsupported OS: $OSTYPE"
    exit 1
    ;;
esac

info "Detected OS: $OS"
info "Log file: $LOG_FILE"
info "Mode: $([[ "$MINIMAL" == "true" ]] && echo "MINIMAL" || echo "FULL")"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1: Essential System Packages
# ═══════════════════════════════════════════════════════════════════════════

stage 1 "Essential System Packages"

if [[ "$OS" != "macos" ]]; then
  eval "$PKG_UPDATE"
fi

ESSENTIAL_PACKAGES="git curl wget jq yq zip unzip tar gzip ca-certificates gnupg"

if [[ "$OS" == "debian" ]]; then
  ESSENTIAL_PACKAGES+=" build-essential libssl-dev pkg-config cmake"
elif [[ "$OS" == "rhel" ]]; then
  ESSENTIAL_PACKAGES+=" gcc gcc-c++ make openssl-devel cmake"
elif [[ "$OS" == "alpine" ]]; then
  ESSENTIAL_PACKAGES+=" build-base openssl-dev cmake"
fi

eval "$PKG_INSTALL $ESSENTIAL_PACKAGES"

log "✅ System packages installed"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2: Core Runtimes (Python, Node.js, Go)
# ═══════════════════════════════════════════════════════════════════════════

stage 2 "Core Runtimes"

# ── Python 3 ────────────────────────────────────────────────────────────────
if install_if_missing "Python 3" "python3" "python3 --version"; then
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL python3 python3-pip python3-venv python3-dev"
  elif [[ "$OS" == "macos" ]]; then
    brew install python@3
  fi
fi

# pip
if install_if_missing "pip" "pip3" "pip3 --version"; then
  python3 -m ensurepip --upgrade
fi

# virtualenv
install_if_missing "virtualenv" "virtualenv" "virtualenv --version" || {
  pip3 install virtualenv
}

# ── Node.js LTS ─────────────────────────────────────────────────────────────
if install_if_missing "Node.js" "node" "node --version"; then
  if [[ "$OS" == "debian" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    eval "$PKG_INSTALL nodejs"
  elif [[ "$OS" == "macos" ]]; then
    brew install node@22
  fi
fi

# npm (ships with Node)
install_if_missing "npm" "npm" "npm --version"

# pnpm
install_if_missing "pnpm" "pnpm" "pnpm --version" || {
  npm install -g pnpm
}

# Yarn
install_if_missing "Yarn" "yarn" "yarn --version" || {
  npm install -g yarn
}

# ── Go ──────────────────────────────────────────────────────────────────────
if install_if_missing "Go" "go" "go version"; then
  local go_ver="1.23.0"
  local go_arch="amd64"
  [[ "$(uname -m)" == "arm64" ]] && go_arch="arm64"
  local go_tar="go${go_ver}.linux-${go_arch}.tar.gz"
  curl -fsSL "https://go.dev/dl/${go_tar}" -o "/tmp/${go_tar}"
  tar -C /usr/local -xzf "/tmp/${go_tar}"
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
fi

if [[ "$MINIMAL" == "true" ]]; then
  log "✅ MINIMAL mode — skipping remaining runtimes"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3: Compiled Languages (Rust, C/C++, Java)
# ═══════════════════════════════════════════════════════════════════════════

stage 3 "Compiled Languages"

# ── Rust / Cargo ────────────────────────────────────────────────────────────
if install_if_missing "Rust" "rustc" "rustc --version"; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

install_if_missing "Cargo" "cargo" "cargo --version"

# ── Java JDK ────────────────────────────────────────────────────────────────
if install_if_missing "Java JDK" "java" "java --version 2>&1 || true"; then
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL openjdk-21-jdk"
  elif [[ "$OS" == "macos" ]]; then
    brew install openjdk@21
  fi
fi

# ── Maven ───────────────────────────────────────────────────────────────────
install_if_missing "Maven" "mvn" "mvn --version 2>&1 | head -1" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL maven"
  elif [[ "$OS" == "macos" ]]; then
    brew install maven
  fi
}

# ── Gradle ──────────────────────────────────────────────────────────────────
install_if_missing "Gradle" "gradle" "gradle --version 2>&1 | head -1" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL gradle"
  elif [[ "$OS" == "macos" ]]; then
    brew install gradle
  fi
}

# ── LLVM / Clang ────────────────────────────────────────────────────────────
install_if_missing "Clang" "clang" "clang --version 2>&1 | head -1" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL llvm clang"
  elif [[ "$OS" == "macos" ]]; then
    brew install llvm
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 4: Scripting Languages (PHP, Ruby, Perl)
# ═══════════════════════════════════════════════════════════════════════════

stage 4 "Scripting Languages"

# ── PHP ─────────────────────────────────────────────────────────────────────
install_if_missing "PHP" "php" "php --version 2>&1 | head -1" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL php php-cli php-xml php-mbstring php-curl composer"
  elif [[ "$OS" == "macos" ]]; then
    brew install php composer
  fi
}

# ── Ruby ────────────────────────────────────────────────────────────────────
install_if_missing "Ruby" "ruby" "ruby --version" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL ruby-full ruby-bundler"
  elif [[ "$OS" == "macos" ]]; then
    brew install ruby bundler
  fi
}

# ── Perl ────────────────────────────────────────────────────────────────────
install_if_missing "Perl" "perl" "perl --version 2>&1 | head -2 | tail -1" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL perl"
  elif [[ "$OS" == "macos" ]]; then
    brew install perl
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 5: Database Clients & Tools
# ═══════════════════════════════════════════════════════════════════════════

stage 5 "Database Clients & Tools"

install_if_missing "SQLite" "sqlite3" "sqlite3 --version" || {
  eval "$PKG_INSTALL sqlite3"
}

install_if_missing "PostgreSQL Client" "psql" "psql --version" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL postgresql-client"
  elif [[ "$OS" == "macos" ]]; then
    brew install libpq
  fi
}

install_if_missing "Redis Client" "redis-cli" "redis-cli --version" || {
  if [[ "$OS" == "debian" ]]; then
    eval "$PKG_INSTALL redis-tools"
  elif [[ "$OS" == "macos" ]]; then
    brew install redis
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 6: Docker Container Runtime
# ═══════════════════════════════════════════════════════════════════════════

if [[ "$SKIP_DOCKER" != "true" ]]; then
  stage 6 "Docker Container Runtime"

  # ── Docker ──────────────────────────────────────────────────────────────────
  if install_if_missing "Docker" "docker" "docker --version"; then
    if [[ "$OS" == "debian" ]]; then
      curl -fsSL https://get.docker.com | bash
    elif [[ "$OS" == "macos" ]]; then
      brew install --cask docker
    fi
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi

  # ── Docker Compose ─────────────────────────────────────────────────────────
  install_if_missing "Docker Compose" "docker-compose" "docker-compose --version" || {
    if command_exists "docker"; then
      docker compose version &>/dev/null && log "✅ Docker Compose v2 (built-in)"
    else
      curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      chmod +x /usr/local/bin/docker-compose
    fi
  }

  # ── Docker Buildx ──────────────────────────────────────────────────────────
  install_if_missing "Docker Buildx" "buildx" || {
    docker buildx version &>/dev/null && log "✅ Docker Buildx (built-in)"
  }

  # ── Git LFS ────────────────────────────────────────────────────────────────
  install_if_missing "Git LFS" "git-lfs" "git-lfs version 2>&1 | head -1" || {
    if [[ "$OS" == "debian" ]]; then
      eval "$PKG_INSTALL git-lfs"
    fi
  }
fi

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 7: Cloud CLI Tools
# ═══════════════════════════════════════════════════════════════════════════

stage 7 "Cloud CLI Tools"

# ── AWS CLI ─────────────────────────────────────────────────────────────────
if install_if_missing "AWS CLI" "aws" "aws --version 2>&1"; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp/
  /tmp/aws/install
fi

# ── Azure CLI ───────────────────────────────────────────────────────────────
if install_if_missing "Azure CLI" "az" "az version 2>&1 | head -1"; then
  curl -fsSL https://aka.ms/InstallAzureCLIDeb | bash
fi

# ── Google Cloud SDK ────────────────────────────────────────────────────────
if install_if_missing "Google Cloud SDK" "gcloud" "gcloud --version 2>&1 | head -1"; then
  curl -fsSL https://sdk.cloud.google.com | bash
fi

# ── kubectl ─────────────────────────────────────────────────────────────────
if install_if_missing "kubectl" "kubectl" "kubectl version --client 2>&1 | head -1"; then
  curl -fsSL "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/$(uname -m)/kubectl" -o /usr/local/bin/kubectl
  chmod +x /usr/local/bin/kubectl
fi

# ── Helm ────────────────────────────────────────────────────────────────────
if install_if_missing "Helm" "helm" "helm version --short 2>&1"; then
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

# ── Terraform ───────────────────────────────────────────────────────────────
if install_if_missing "Terraform" "terraform" "terraform --version 2>&1 | head -1"; then
  curl -fsSL "https://releases.hashicorp.com/terraform/$(curl -fsSL https://checkpoint-api.hashicorp.com/v1/check/terraform | jq -r .current_version)/terraform_$(curl -fsSL https://checkpoint-api.hashicorp.com/v1/check/terraform | jq -r .current_version)_linux_$(uname -m).zip" -o /tmp/terraform.zip
  unzip -o /tmp/terraform.zip -d /usr/local/bin/
fi

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 8: Networking & Security Tools
# ═══════════════════════════════════════════════════════════════════════════

stage 8 "Networking & Security Tools"

install_if_missing "Nmap" "nmap" "nmap --version 2>&1 | head -1" || {
  eval "$PKG_INSTALL nmap"
}

install_if_missing "OpenSSL" "openssl" "openssl version" || {
  # Should already be installed, but just in case
  eval "$PKG_INSTALL openssl"
}

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 9: Verify All Installations
# ═══════════════════════════════════════════════════════════════════════════

stage 9 "Verification"

TOOLS=(
  "python3:Python 3"
  "pip3:pip"
  "virtualenv:virtualenv"
  "node:Node.js"
  "npm:npm"
  "pnpm:pnpm"
  "go:Go"
  "rustc:Rust"
  "cargo:Cargo"
  "java:Java JDK"
  "git:Git"
  "curl:cURL"
  "wget:Wget"
  "jq:jq"
  "yq:yq"
  "zip:zip"
  "unzip:unzip"
  "tar:tar"
  "gzip:gzip"
  "sqlite3:SQLite"
  "docker:Docker"
  "nmap:Nmap"
  "openssl:OpenSSL"
)

PASS=0
FAIL=0

for entry in "${TOOLS[@]}"; do
  cmd="${entry%%:*}"
  name="${entry##*:}"
  if command_exists "$cmd"; then
    echo -e "  ${GREEN}✅${NC} $name"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} $name"
    ((FAIL++))
  fi
done

echo ""
log "✅ $PASS tools available  ❌ $FAIL missing"

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 10: Summary
# ═══════════════════════════════════════════════════════════════════════════

stage 10 "Bootstrap Complete"

echo -e "${GREEN}
┌─────────────────────────────────────────────────────────┐
│  V8 Neural Exploitation Platform — Environment Ready     │
├─────────────────────────────────────────────────────────┤
│  Version : ${CYAN}$V8_VERSION${GREEN}                                             │
│  OS      : ${CYAN}$OS${GREEN}                                              │
│  Mode    : ${CYAN}$([[ "$MINIMAL" == "true" ]] && echo "MINIMAL" || echo "FULL")${GREEN}                                             │
│  Tools   : ${CYAN}$PASS available, $FAIL missing${GREEN}                              │
│  Log     : ${CYAN}$LOG_FILE${GREEN}                         │
└─────────────────────────────────────────────────────────┘${NC}
"

# Final recommendations
if [[ $FAIL -gt 0 ]]; then
  warn "Some tools could not be installed. Check the log for details."
  warn "You may need to install them manually for full platform functionality."
fi

echo -e "Next steps:"
echo -e "  1. ${CYAN}cd /opt/v8-platform && pnpm install${NC}"
echo -e "  2. ${CYAN}cp .env.example .env && edit DATABASE_URL${NC}"
echo -e "  3. ${CYAN}pnpm --filter @workspace/db push${NC}"
echo -e "  4. ${CYAN}pnpm --filter @workspace/api-server dev${NC}"
echo ""
echo -e "V8 Platform v${V8_VERSION} — Ready for deployment."

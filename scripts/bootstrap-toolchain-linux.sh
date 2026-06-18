#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root or with sudo: sudo bash scripts/bootstrap-toolchain-linux.sh" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  wget \
  git \
  build-essential \
  gcc \
  g++ \
  make \
  pkg-config \
  openssl \
  libssl-dev \
  python3 \
  python3-pip \
  python3-venv \
  nodejs \
  npm \
  jq \
  unzip \
  zip \
  tar \
  gzip

if ! command -v go >/dev/null 2>&1; then
  GO_VERSION="${GO_VERSION:-1.23.5}"
  ARCH="$(dpkg --print-architecture)"
  case "${ARCH}" in
    amd64) GO_ARCH="amd64" ;;
    arm64) GO_ARCH="arm64" ;;
    *) echo "Unsupported Go architecture: ${ARCH}" >&2; exit 1 ;;
  esac
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o /tmp/go.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi

if ! command -v rustc >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain stable
  ln -sf /root/.cargo/bin/rustc /usr/local/bin/rustc
  ln -sf /root/.cargo/bin/cargo /usr/local/bin/cargo
fi

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

cat >/etc/profile.d/v8-toolchain.sh <<'EOF'
export GOPATH="${GOPATH:-$HOME/go}"
export GOROOT="/usr/local/go"
export PATH="/usr/local/go/bin:$HOME/go/bin:$HOME/.cargo/bin:$PATH"
EOF

echo "Toolchain bootstrap complete."
echo "Versions:"
git --version || true
python3 --version || true
pip3 --version || true
go version || true
rustc --version || true
cargo --version || true
docker --version || true
docker compose version || true

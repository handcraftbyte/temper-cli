#!/bin/bash
set -e

# Temper CLI installer
# Usage: curl -fsSL https://tempercode.dev/install.sh | bash

REPO="handcraftbyte/temper-cli"
INSTALL_DIR="${TEMPER_INSTALL_DIR:-/usr/local/bin}"
BASE_URL="https://github.com/$REPO/releases/latest/download"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
  echo -e "${BLUE}==>${NC} $1"
}

success() {
  echo -e "${GREEN}==>${NC} $1"
}

error() {
  echo -e "${RED}error:${NC} $1"
  exit 1
}

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "darwin" ;;
    Linux*)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) error "Unsupported operating system: $(uname -s)" ;;
  esac
}

# Detect architecture
detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) error "Unsupported architecture: $(uname -m)" ;;
  esac
}

OS=$(detect_os)
ARCH=$(detect_arch)

# Build download URL
if [ "$OS" = "windows" ]; then
  BINARY_NAME="temper-${OS}-${ARCH}.exe"
  TARGET_NAME="temper.exe"
else
  BINARY_NAME="temper-${OS}-${ARCH}"
  TARGET_NAME="temper"
fi

DOWNLOAD_URL="${BASE_URL}/${BINARY_NAME}"

info "Detected: $OS-$ARCH"
info "Downloading from: $DOWNLOAD_URL"

# Create install directory
sudo mkdir -p "$INSTALL_DIR"

# Download binary to temp location first, then move with sudo
TEMP_FILE=$(mktemp)
if command -v curl &> /dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_FILE"
elif command -v wget &> /dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$TEMP_FILE"
else
  error "Neither curl nor wget found. Please install one of them."
fi

# Move to install directory with sudo
sudo mv "$TEMP_FILE" "$INSTALL_DIR/$TARGET_NAME"
sudo chmod +x "$INSTALL_DIR/$TARGET_NAME"

success "Installed temper to $INSTALL_DIR/$TARGET_NAME"
success "Installation complete! Run 'temper --help' to get started."

#!/bin/bash
set -e

# Temper CLI installer
# Usage: curl -fsSL https://tempercode.dev/install.sh | bash

REPO="handcraftbyte/temper-cli"
INSTALL_DIR="${TEMPER_INSTALL_DIR:-$HOME/.temper/bin}"
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
mkdir -p "$INSTALL_DIR"

# Download binary
if command -v curl &> /dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/$TARGET_NAME"
elif command -v wget &> /dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/$TARGET_NAME"
else
  error "Neither curl nor wget found. Please install one of them."
fi

# Make executable
chmod +x "$INSTALL_DIR/$TARGET_NAME"

success "Installed temper to $INSTALL_DIR/$TARGET_NAME"

# Check if in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo ""
  info "Add temper to your PATH by adding this to your shell config:"
  echo ""
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
  echo ""

  # Detect shell and suggest config file
  SHELL_NAME=$(basename "$SHELL")
  case "$SHELL_NAME" in
    bash)
      echo "  # Add to ~/.bashrc or ~/.bash_profile"
      ;;
    zsh)
      echo "  # Add to ~/.zshrc"
      ;;
    fish)
      echo "  # Or for fish, run:"
      echo "  fish_add_path $INSTALL_DIR"
      ;;
  esac
  echo ""
fi

success "Installation complete! Run 'temper --help' to get started."

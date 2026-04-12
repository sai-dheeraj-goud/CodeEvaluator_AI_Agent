#!/bin/bash
set -e

# ====================================================================
# PORTABLE RUNTIME SETUP — Downloads Node.js, JDK, Python into runtimes/
# Run this ONCE after cloning/copying the project to a new machine.
# After setup, use start.sh to launch the server.
# ====================================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIMES_DIR="$PROJECT_DIR/runtimes"
DOWNLOADS_DIR="$RUNTIMES_DIR/downloads"

# ---- Version Configuration ----
NODE_VERSION="20.18.1"
JDK_VERSION="21.0.2"
JDK_BUILD="13"
PYTHON_VERSION="3.12.8"

echo ""
echo "============================================"
echo "  Portable Runtime Setup"
echo "============================================"
echo "  Project: $PROJECT_DIR"
echo "  Runtimes: $RUNTIMES_DIR"
echo "============================================"
echo ""

# Detect OS and arch
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="mac" ;;
    *)       echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
    x86_64|amd64) CPU_ARCH="x64" ;;
    aarch64|arm64) CPU_ARCH="arm64" ;;
    *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Detected: $PLATFORM / $CPU_ARCH"

mkdir -p "$RUNTIMES_DIR"
mkdir -p "$DOWNLOADS_DIR"

# ==================== NODE.JS ====================
echo ""
echo "[1/4] Setting up Node.js v$NODE_VERSION..."

NODE_DIR="$RUNTIMES_DIR/node"
if [ -f "$NODE_DIR/bin/node" ]; then
    echo "  ✓ Node.js already installed, skipping download."
else
    NODE_TAR="node-v${NODE_VERSION}-${PLATFORM}-${CPU_ARCH}.tar.xz"
    if [ "$PLATFORM" = "mac" ]; then
        NODE_TAR="node-v${NODE_VERSION}-darwin-${CPU_ARCH}.tar.gz"
    fi
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}"
    NODE_DOWNLOAD="$DOWNLOADS_DIR/$NODE_TAR"

    if [ ! -f "$NODE_DOWNLOAD" ]; then
        echo "  Downloading Node.js from $NODE_URL..."
        curl -fSL "$NODE_URL" -o "$NODE_DOWNLOAD" || wget -q "$NODE_URL" -O "$NODE_DOWNLOAD" || {
            echo "  ✗ Failed to download Node.js"
            NODE_DOWNLOAD=""
        }
    fi

    if [ -n "$NODE_DOWNLOAD" ] && [ -f "$NODE_DOWNLOAD" ]; then
        echo "  Extracting Node.js..."
        rm -rf "$NODE_DIR"
        mkdir -p "$NODE_DIR"
        if [[ "$NODE_TAR" == *.tar.xz ]]; then
            tar -xf "$NODE_DOWNLOAD" -C "$RUNTIMES_DIR"
        else
            tar -xzf "$NODE_DOWNLOAD" -C "$RUNTIMES_DIR"
        fi
        # Rename extracted folder
        for d in "$RUNTIMES_DIR"/node-v*; do
            if [ -d "$d" ]; then
                rm -rf "$NODE_DIR"
                mv "$d" "$NODE_DIR"
            fi
        done
        if [ -f "$NODE_DIR/bin/node" ]; then
            echo "  ✓ Node.js v$NODE_VERSION installed successfully."
        else
            echo "  ✗ Node.js extraction failed."
        fi
    fi
fi

# ==================== JAVA (OpenJDK) ====================
echo ""
echo "[2/4] Setting up OpenJDK $JDK_VERSION..."

JAVA_DIR="$RUNTIMES_DIR/java"
if [ -f "$JAVA_DIR/bin/java" ]; then
    echo "  ✓ Java already installed, skipping download."
else
    if [ "$PLATFORM" = "linux" ]; then
        JDK_TAR="openjdk-${JDK_VERSION}_linux-${CPU_ARCH}_bin.tar.gz"
    else
        JDK_TAR="openjdk-${JDK_VERSION}_macos-${CPU_ARCH}_bin.tar.gz"
    fi
    JDK_URL="https://download.java.net/java/GA/jdk${JDK_VERSION}/${JDK_BUILD}/GPL/${JDK_TAR}"
    JDK_DOWNLOAD="$DOWNLOADS_DIR/$JDK_TAR"

    if [ ! -f "$JDK_DOWNLOAD" ]; then
        echo "  Downloading OpenJDK from $JDK_URL..."
        curl -fSL "$JDK_URL" -o "$JDK_DOWNLOAD" || wget -q "$JDK_URL" -O "$JDK_DOWNLOAD" || {
            echo "  ✗ Failed to download JDK"
            JDK_DOWNLOAD=""
        }
    fi

    if [ -n "$JDK_DOWNLOAD" ] && [ -f "$JDK_DOWNLOAD" ]; then
        echo "  Extracting OpenJDK..."
        rm -rf "$JAVA_DIR"
        tar -xzf "$JDK_DOWNLOAD" -C "$RUNTIMES_DIR"
        # Rename extracted folder
        for d in "$RUNTIMES_DIR"/jdk-*; do
            if [ -d "$d" ]; then
                # On Mac, the JDK has a Contents/Home structure
                if [ "$PLATFORM" = "mac" ] && [ -d "$d/Contents/Home" ]; then
                    rm -rf "$JAVA_DIR"
                    mv "$d/Contents/Home" "$JAVA_DIR"
                    rm -rf "$d"
                else
                    rm -rf "$JAVA_DIR"
                    mv "$d" "$JAVA_DIR"
                fi
            fi
        done
        if [ -f "$JAVA_DIR/bin/java" ]; then
            echo "  ✓ OpenJDK $JDK_VERSION installed successfully."
        else
            echo "  ✗ JDK extraction failed."
        fi
    fi
fi

# ==================== PYTHON ====================
echo ""
echo "[3/4] Setting up Python $PYTHON_VERSION..."

PYTHON_DIR="$RUNTIMES_DIR/python"
if [ -f "$PYTHON_DIR/bin/python3" ] || [ -f "$PYTHON_DIR/bin/python" ]; then
    echo "  ✓ Python already installed, skipping download."
else
    # For Linux/Mac, we download the source and build, or use a standalone build
    # Using python-build-standalone (indygreg) for truly portable Python
    PYTHON_STANDALONE_VERSION="20241206"
    if [ "$PLATFORM" = "linux" ]; then
        PY_TAR="cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_VERSION}-${CPU_ARCH}-unknown-linux-gnu-install_only_stripped.tar.gz"
    else
        PY_TAR="cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_VERSION}-${CPU_ARCH}-apple-darwin-install_only_stripped.tar.gz"
    fi
    PY_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_STANDALONE_VERSION}/${PY_TAR}"
    PY_DOWNLOAD="$DOWNLOADS_DIR/$PY_TAR"

    if [ ! -f "$PY_DOWNLOAD" ]; then
        echo "  Downloading Python from $PY_URL..."
        curl -fSL "$PY_URL" -o "$PY_DOWNLOAD" || wget -q "$PY_URL" -O "$PY_DOWNLOAD" || {
            echo "  ✗ Failed to download Python standalone."
            echo "  Trying system Python as fallback..."
            PY_DOWNLOAD=""
        }
    fi

    if [ -n "$PY_DOWNLOAD" ] && [ -f "$PY_DOWNLOAD" ]; then
        echo "  Extracting Python..."
        rm -rf "$PYTHON_DIR"
        mkdir -p "$RUNTIMES_DIR/python_temp"
        tar -xzf "$PY_DOWNLOAD" -C "$RUNTIMES_DIR/python_temp"
        # The standalone build extracts to a 'python' folder
        if [ -d "$RUNTIMES_DIR/python_temp/python" ]; then
            mv "$RUNTIMES_DIR/python_temp/python" "$PYTHON_DIR"
        elif [ -d "$RUNTIMES_DIR/python_temp/install" ]; then
            mv "$RUNTIMES_DIR/python_temp/install" "$PYTHON_DIR"
        else
            # Move whatever was extracted
            mv "$RUNTIMES_DIR"/python_temp/* "$PYTHON_DIR" 2>/dev/null || true
        fi
        rm -rf "$RUNTIMES_DIR/python_temp"
        
        if [ -f "$PYTHON_DIR/bin/python3" ] || [ -f "$PYTHON_DIR/bin/python" ]; then
            echo "  ✓ Python $PYTHON_VERSION installed successfully."
        else
            echo "  ✗ Python extraction failed."
        fi
    fi
fi

# ==================== DOWNLOAD CODEMIRROR ====================
echo ""
echo "[4/4] Setting up CodeMirror (offline editor library)..."

LIB_DIR="$PROJECT_DIR/public/lib/codemirror"
if [ -f "$LIB_DIR/codemirror.min.js" ]; then
    echo "  ✓ CodeMirror already downloaded, skipping."
else
    mkdir -p "$LIB_DIR/mode"
    mkdir -p "$LIB_DIR/addon"

    CM_BASE="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2"

    echo "  Downloading CodeMirror core..."
    curl -fsSL "$CM_BASE/codemirror.min.js" -o "$LIB_DIR/codemirror.min.js" || wget -q "$CM_BASE/codemirror.min.js" -O "$LIB_DIR/codemirror.min.js" || true
    curl -fsSL "$CM_BASE/codemirror.min.css" -o "$LIB_DIR/codemirror.min.css" || wget -q "$CM_BASE/codemirror.min.css" -O "$LIB_DIR/codemirror.min.css" || true
    curl -fsSL "$CM_BASE/theme/material.min.css" -o "$LIB_DIR/material.min.css" || wget -q "$CM_BASE/theme/material.min.css" -O "$LIB_DIR/material.min.css" || true

    echo "  Downloading CodeMirror modes and addons..."
    curl -fsSL "$CM_BASE/mode/clike/clike.min.js" -o "$LIB_DIR/mode/clike.min.js" || true
    curl -fsSL "$CM_BASE/mode/python/python.min.js" -o "$LIB_DIR/mode/python.min.js" || true
    curl -fsSL "$CM_BASE/addon/edit/closebrackets.min.js" -o "$LIB_DIR/addon/closebrackets.min.js" || true
    curl -fsSL "$CM_BASE/addon/edit/matchbrackets.min.js" -o "$LIB_DIR/addon/matchbrackets.min.js" || true
    curl -fsSL "$CM_BASE/addon/comment/comment.min.js" -o "$LIB_DIR/addon/comment.min.js" || true

    if [ -f "$LIB_DIR/codemirror.min.js" ]; then
        echo "  ✓ CodeMirror downloaded successfully."
    else
        echo "  ✗ CodeMirror download failed. The app will fall back to CDN."
    fi
fi

# ==================== CLEANUP DOWNLOADS ====================
echo ""
echo "Cleaning up download cache..."
rm -rf "$DOWNLOADS_DIR"
echo "  ✓ Cleaned up."

# ==================== SUMMARY ====================
echo ""
echo "============================================"
echo "  Setup Complete! Runtime Status:"
echo "============================================"

[ -f "$NODE_DIR/bin/node" ] && echo "  ✓ Node.js  : $NODE_DIR/bin/node" || echo "  ✗ Node.js  : NOT INSTALLED"
[ -f "$JAVA_DIR/bin/java" ] && echo "  ✓ Java     : $JAVA_DIR/bin/java" || echo "  ✗ Java     : NOT INSTALLED"
([ -f "$PYTHON_DIR/bin/python3" ] || [ -f "$PYTHON_DIR/bin/python" ]) && echo "  ✓ Python   : $PYTHON_DIR" || echo "  ✗ Python   : NOT INSTALLED"
[ -f "$LIB_DIR/codemirror.min.js" ] && echo "  ✓ CodeMirror: $LIB_DIR" || echo "  ✗ CodeMirror: NOT DOWNLOADED (will use CDN)"

echo ""
echo "============================================"
echo "  Next step: Run ./start.sh to launch"
echo "============================================"
echo ""

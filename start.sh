#!/bin/bash
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_NODE="$PROJECT_DIR/runtimes/node/bin/node"

# ---- Check for local (portable) Node.js first, then system ----
if [ -f "$LOCAL_NODE" ]; then
    echo "Using portable Node.js: $LOCAL_NODE"
    NODE_CMD="$LOCAL_NODE"
elif command -v node &>/dev/null; then
    echo "Using system Node.js"
    NODE_CMD="node"
else
    echo "✗ Node.js not found!"
    echo "  Run ./setup-runtimes.sh first to download portable runtimes,"
    echo "  or install Node.js from https://nodejs.org"
    exit 1
fi

# ---- Check for local Java, then system ----
if [ -f "$PROJECT_DIR/runtimes/java/bin/java" ]; then
    echo "Java: portable (runtimes/java)"
elif command -v java &>/dev/null; then
    echo "Java: system"
else
    echo "Warning: Java not found. Run ./setup-runtimes.sh or install Java."
fi

# ---- Check for local Python, then system ----
if [ -f "$PROJECT_DIR/runtimes/python/bin/python3" ] || [ -f "$PROJECT_DIR/runtimes/python/bin/python" ]; then
    echo "Python: portable (runtimes/python)"
elif command -v python3 &>/dev/null || command -v python &>/dev/null; then
    echo "Python: system"
else
    echo "Warning: Python not found. Run ./setup-runtimes.sh or install Python."
fi

echo ""
echo "Starting Code Evaluator AI Agent..."
echo "Open browser: http://localhost:3000"
echo ""
"$NODE_CMD" "$PROJECT_DIR/src/server.js"

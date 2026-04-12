# ============================================================
# Dockerfile — Code Evaluator AI Agent
# Multi-runtime: Node.js 20 + OpenJDK 21 + Python 3.11
# Zero npm dependencies — just copies the project and runs
# ============================================================

FROM node:20-slim

# Install OpenJDK and Python in one layer (keeps image small)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless \
        python3 \
        python3-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Verify runtimes
RUN node --version && java -version && python3 --version

# Create app directory
WORKDIR /app

# Copy project files (respects .dockerignore)
COPY . .

# Create required directories
RUN mkdir -p temp results/json results/csv public/lib/codemirror

# Download CodeMirror for offline use (if not already present)
RUN if [ ! -f public/lib/codemirror/codemirror.min.js ]; then \
        apt-get update && apt-get install -y --no-install-recommends curl && \
        mkdir -p public/lib/codemirror/mode public/lib/codemirror/addon && \
        CM_BASE="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2" && \
        curl -fsSL "$CM_BASE/codemirror.min.js" -o public/lib/codemirror/codemirror.min.js && \
        curl -fsSL "$CM_BASE/codemirror.min.css" -o public/lib/codemirror/codemirror.min.css && \
        curl -fsSL "$CM_BASE/theme/material.min.css" -o public/lib/codemirror/material.min.css && \
        curl -fsSL "$CM_BASE/mode/clike/clike.min.js" -o public/lib/codemirror/mode/clike.min.js && \
        curl -fsSL "$CM_BASE/mode/python/python.min.js" -o public/lib/codemirror/mode/python.min.js && \
        curl -fsSL "$CM_BASE/addon/edit/closebrackets.min.js" -o public/lib/codemirror/addon/closebrackets.min.js && \
        curl -fsSL "$CM_BASE/addon/edit/matchbrackets.min.js" -o public/lib/codemirror/addon/matchbrackets.min.js && \
        curl -fsSL "$CM_BASE/addon/comment/comment.min.js" -o public/lib/codemirror/addon/comment.min.js && \
        apt-get remove -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* ; \
    fi

# Expose port (cloud platforms override via PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD node -e "const http=require('http');http.get('http://localhost:'+process.env.PORT||3000+'/api/version',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Start the server
CMD ["node", "src/server.js"]

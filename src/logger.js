// ==================== CUSTOM LOGGER ====================
// Redirects all console output to both console and a log file

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max log size

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// In-memory buffer for recent logs (last 500 lines)
let logBuffer = [];
const MAX_BUFFER_LINES = 500;

// Store original console methods before overriding
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

function addToBuffer(line) {
    logBuffer.push(line);
    if (logBuffer.length > MAX_BUFFER_LINES) {
        logBuffer.shift();
    }
}

function formatLog(type, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    
    return `[${timestamp}] [${type.toUpperCase()}] ${message}`;
}

function writeToFile(line) {
    try {
        // Check file size and rotate if needed
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                const backupFile = `${LOG_FILE}.${Date.now()}`;
                fs.renameSync(LOG_FILE, backupFile);
                // Keep only last 5 backup files
                const files = fs.readdirSync(LOG_DIR)
                    .filter(f => f.startsWith('server.log.'))
                    .sort()
                    .reverse();
                if (files.length > 5) {
                    files.slice(5).forEach(f => {
                        fs.unlinkSync(path.join(LOG_DIR, f));
                    });
                }
            }
        }
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch (e) {
        // Silently fail if can't write to file
    }
}

// Custom logger functions
const logger = {
    log: function(...args) {
        const line = formatLog('log', args);
        addToBuffer(line);
        writeToFile(line);
        originalConsole.log(line);  // Use original console
    },
    
    info: function(...args) {
        const line = formatLog('info', args);
        addToBuffer(line);
        writeToFile(line);
        originalConsole.info(line);
    },
    
    warn: function(...args) {
        const line = formatLog('warn', args);
        addToBuffer(line);
        writeToFile(line);
        originalConsole.warn(line);
    },
    
    error: function(...args) {
        const line = formatLog('error', args);
        addToBuffer(line);
        writeToFile(line);
        originalConsole.error(line);
    },
    
    debug: function(...args) {
        const line = formatLog('debug', args);
        addToBuffer(line);
        writeToFile(line);
        // Don't output debug to console by default
    },
    
    getRecentLogs: function(lines = 100) {
        // Return last N lines from buffer
        return logBuffer.slice(-lines).join('\n');
    },
    
    getAllLogs: function() {
        // Return all buffered logs
        return logBuffer.join('\n');
    },
    
    clearLogs: function() {
        logBuffer = [];
        try {
            if (fs.existsSync(LOG_FILE)) {
                fs.unlinkSync(LOG_FILE);
            }
        } catch (e) {
            // Silently fail
        }
    }
};

// Override console methods to use logger
global.console.log = logger.log;
global.console.info = logger.info;
global.console.warn = logger.warn;
global.console.error = logger.error;
global.console.debug = logger.debug;

module.exports = logger;

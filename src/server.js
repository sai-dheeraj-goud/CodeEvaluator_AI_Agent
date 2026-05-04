// ====================================================================
// CONFIGURATION — All settings are in data/config.js
// ====================================================================
const APP_CONFIG = require('../data/config.js');

const MAX_EXPERIENCE_YEARS = APP_CONFIG.maxExperienceYears;
const EXPERIENCE_TIERS     = APP_CONFIG.experienceTiers;
const QUESTIONS_FILE_REL   = APP_CONFIG.questionsFileRel;
const PORT = parseInt(process.env.PORT, 10) || APP_CONFIG.port;

// ====================================================================
// END OF CONFIGURATION — No need to edit below this line
// ====================================================================

// ==================== INITIALIZE LOGGER ====================
// This MUST be loaded first to capture all console output
const logger = require('./logger');

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const url = require('url');
const net = require('net');
const tls = require('tls');
const { exec, spawn } = require('child_process');

// ==================== RESOLVE QUESTIONS FILE ====================
const QUESTIONS_FILE = path.join(__dirname, QUESTIONS_FILE_REL);

// ==================== ENVIRONMENT VARIABLES ====================
// Manual .env loader (zero-dependency — no dotenv needed)
(function loadEnvFile() {
    try {
        const envPath = path.join(__dirname, '../.env');
        if (!fs.existsSync(envPath)) return;
        const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            // Remove surrounding quotes if present
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            // Only set if not already defined in real environment
            if (!(key in process.env)) {
                process.env[key] = val;
            }
        }
        console.log('✓ Loaded .env configuration');
    } catch (e) {
        console.log('⚠ Could not load .env file:', e.message);
    }
})();

// --- AI Provider Configuration ---
const USE_GEMINI = (process.env.USE_GEMINI || 'false').toLowerCase() === 'true';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || GEMINI_API_KEY).split(/[,;]/).map(k => k.trim()).filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_MODELS = (process.env.GEMINI_MODELS || GEMINI_MODEL).split(',').map(m => m.trim()).filter(Boolean);
let GEMINI_MODEL_INDEX = 0;
let GEMINI_KEY_INDEX = 0;

const USE_CLAUDE = (process.env.USE_CLAUDE || 'false').toLowerCase() === 'true';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';
const CLAUDE_BASE_URL = process.env.CLAUDE_BASE_URL || '';
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS, 10) || 30000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

const USE_OLLAMA = (process.env.USE_OLLAMA || 'false').toLowerCase() === 'true';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// ==================== PORTABLE RUNTIME RESOLUTION ====================
function resolvePortableRuntime(lang) {
    const runtimesDir = path.join(__dirname, '..', 'runtimes');
    if (lang === 'java') {
        const javaHome = path.join(runtimesDir, 'jdk');
        const javaBin = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
        if (fs.existsSync(javaBin)) return javaHome;
        try {
            const entries = fs.readdirSync(runtimesDir).filter(e => e.startsWith('jdk'));
            for (const entry of entries) {
                const bin = path.join(runtimesDir, entry, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
                if (fs.existsSync(bin)) return path.join(runtimesDir, entry);
            }
        } catch (e) {}
        return null;
    } else if (lang === 'python') {
        const pyDir = path.join(runtimesDir, 'python');
        const pyBin = path.join(pyDir, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
        if (fs.existsSync(pyBin)) return pyDir;
        try {
            const entries = fs.readdirSync(runtimesDir).filter(e => e.startsWith('python'));
            for (const entry of entries) {
                const bin = path.join(runtimesDir, entry, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
                if (fs.existsSync(bin)) return path.join(runtimesDir, entry);
            }
        } catch (e) {}
        return null;
    }
    return null;
}

const JAVA_HOME = resolvePortableRuntime('java');
const JAVA_CMD = JAVA_HOME ? path.join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const JAVAC_CMD = JAVA_HOME ? path.join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac') : 'javac';
const PYTHON_HOME = resolvePortableRuntime('python');
const PYTHON_CMD = PYTHON_HOME ? path.join(PYTHON_HOME, process.platform === 'win32' ? 'python.exe' : 'bin/python3') : 'python';

// ==================== PROCESS LOCK ====================
const LOCK_FILE = path.join(__dirname, '..', '.server.lock');
function acquireProcessLock() {
    try { fs.writeFileSync(LOCK_FILE, String(process.pid)); } catch (e) {}
}
function releaseProcessLock() {
    try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
}
acquireProcessLock();

// ==================== PRE-CREATE TEMP DIRECTORY ====================
const TEMP_DIR = path.join(__dirname, '../temp');
try { fs.mkdirSync(TEMP_DIR, { recursive: true }); } catch (e) {}

// ==================== UTILITY HELPERS ====================
function execAsync(cmd, opts) {
    return new Promise((resolve, reject) => {
        exec(cmd, opts, (err, stdout, stderr) => {
            if (err) { err.stdout = stdout; err.stderr = stderr; return reject(err); }
            resolve({ stdout, stderr });
        });
    });
}

function spawnWithInput(command, args, opts, input) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => stdout += d);
        child.stderr.on('data', d => stderr += d);
        child.on('close', code => {
            if (code !== 0) {
                const err = new Error(`Process exited with code ${code}`);
                err.stdout = stdout; err.stderr = stderr; err.code = code;
                return reject(err);
            }
            resolve({ stdout, stderr });
        });
        child.on('error', reject);
        if (input) { child.stdin.write(input); child.stdin.end(); }
        if (opts && opts.timeout) {
            setTimeout(() => { try { child.kill('SIGTERM'); } catch (e) {} }, opts.timeout);
        }
    });
}

function getISTTimestamp() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (5.5 * 3600000));
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${ist.getFullYear()}-${pad(ist.getMonth()+1)}-${pad(ist.getDate())}T${pad(ist.getHours())}:${pad(ist.getMinutes())}:${pad(ist.getSeconds())}-${pad(ist.getMilliseconds(),3)}+05:30`;
}

// ==================== PANELIST EMAIL WHITELIST ====================
const PANELIST_EMAILS_CSV_PATH = path.join(__dirname, '..', APP_CONFIG.panelistEmailsCsvPath || './data/panelist-emails.csv');
let authorizedPanelistEmails = new Set();

function loadPanelistEmails() {
    try {
        if (!fs.existsSync(PANELIST_EMAILS_CSV_PATH)) {
            console.warn(`\u26a0 Panelist emails CSV not found: ${PANELIST_EMAILS_CSV_PATH}`);
            return;
        }
        const raw = fs.readFileSync(PANELIST_EMAILS_CSV_PATH, 'utf-8');
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const emails = lines.slice(1)
            .map(line => {
                const field = line.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase();
                return field;
            })
            .filter(e => e && e.includes('@'));
        authorizedPanelistEmails = new Set(emails);
        console.log(`\u2713 Loaded ${authorizedPanelistEmails.size} panelist email(s) from CSV`);
    } catch (err) {
        console.error('\u2717 Failed to load panelist emails CSV:', err.message);
    }
}
loadPanelistEmails();

// Watch panelist CSV for changes and auto-reload
try {
    fs.watchFile(PANELIST_EMAILS_CSV_PATH, { interval: 5000 }, () => {
        console.log('\u21bb Panelist emails CSV changed \u2014 reloading...');
        loadPanelistEmails();
    });
} catch (e) {}

function isPanelistEmailServer(email) {
    return authorizedPanelistEmails.has((email || '').trim().toLowerCase());
}

// ==================== CANDIDATE EMAIL WHITELIST ====================
const CANDIDATE_EMAIL_VERIFICATION = APP_CONFIG.candidateEmailVerification !== false;
const CANDIDATE_EMAILS_CSV_PATH = path.join(__dirname, '..', APP_CONFIG.candidateEmailsCsvPath || './data/candidate-emails.csv');
let authorizedCandidateEmails = new Set();
const loggedInCandidates = new Set(); // tracks emails that have already completed OTP verification
const submittedCandidates = new Set(); // tracks emails that have submitted/completed their assessment

function loadCandidateEmails() {
    try {
        if (!CANDIDATE_EMAIL_VERIFICATION) {
            console.log('⚠ Candidate email verification is DISABLED (open access)');
            return;
        }
        if (!fs.existsSync(CANDIDATE_EMAILS_CSV_PATH)) {
            console.warn(`⚠ Candidate emails CSV not found: ${CANDIDATE_EMAILS_CSV_PATH}`);
            return;
        }
        const raw = fs.readFileSync(CANDIDATE_EMAILS_CSV_PATH, 'utf-8');
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // Skip header row (first line)
        const emails = lines.slice(1)
            .map(line => {
                // Handle CSV with or without quotes; take first column
                const field = line.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase();
                return field;
            })
            .filter(e => e && e.includes('@'));
        authorizedCandidateEmails = new Set(emails);
        console.log(`✓ Loaded ${authorizedCandidateEmails.size} authorized candidate email(s) from CSV`);
    } catch (err) {
        console.error('✗ Failed to load candidate emails CSV:', err.message);
    }
}
loadCandidateEmails();

// Watch CSV for changes and auto-reload
try {
    fs.watchFile(CANDIDATE_EMAILS_CSV_PATH, { interval: 5000 }, () => {
        console.log('↻ Candidate emails CSV changed — reloading...');
        loadCandidateEmails();
    });
} catch (e) {}

function isCandidateAuthorized(email) {
    if (!CANDIDATE_EMAIL_VERIFICATION) return true; // open access
    return authorizedCandidateEmails.has(email.trim().toLowerCase());
}

function hasCandidateAlreadyLoggedIn(email) {
    // Only block if the candidate has SUBMITTED their assessment
    // Allow re-login for active sessions (page reload, network issues)
    return submittedCandidates.has(email.trim().toLowerCase());
}

function markCandidateLoggedIn(email) {
    loggedInCandidates.add(email.trim().toLowerCase());
}

// ==================== IN-MEMORY STORES ====================
const rateLimitStore = new Map();
const otpStore = new Map();
const sessionStore = new Map();

// ==================== OTP / AUTH HELPERS ====================
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function checkOTPRateLimit(email) {
    const now = Date.now();
    const limit = rateLimitStore.get(email) || { count: 0, windowStart: now };
    if (now - limit.windowStart > 10 * 60 * 1000) {
        rateLimitStore.set(email, { count: 1, windowStart: now });
        return true;
    }
    if (limit.count >= 5) return false;
    limit.count++;
    rateLimitStore.set(email, limit);
    return true;
}

// ==================== SMTP EMAIL FUNCTIONS ====================

// Parse semicolon-separated values into an array (e.g. "user1@gmail.com;user2@gmail.com")
function parseList(envValue) {
    return (envValue || '').split(';').map(s => s.trim()).filter(Boolean);
}

// Round-robin index for Gmail accounts (in-memory; resets when server restarts)
let GMAIL_ACCOUNT_INDEX = 0;

// Returns ALL Gmail SMTP configs (one per account). Caller can iterate to retry on quota errors.
function getAllGmailConfigs() {
    const users = parseList(process.env.GMAIL_SMTP_USER);
    const passes = parseList(process.env.GMAIL_SMTP_PASS);
    const host = process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.GMAIL_SMTP_PORT || '587');
    const from = process.env.GMAIL_SMTP_FROM || 'Code Evaluator';

    const configs = [];
    const count = Math.min(users.length, passes.length);
    for (let i = 0; i < count; i++) {
        configs.push({ host, port, user: users[i], pass: passes[i], from });
    }
    return configs;
}

function getSmtpConfig(recipientEmail) {
    // If recipient is Gmail OR default SMTP credentials are empty, use Gmail SMTP
    const defaultSmtpUser = process.env.SMTP_USER || '';
    const defaultSmtpPass = process.env.SMTP_PASS || '';
    const useGmail = recipientEmail.toLowerCase().endsWith('@gmail.com') || !defaultSmtpUser || !defaultSmtpPass;

    const gmailConfigs = getAllGmailConfigs();
    if (useGmail && gmailConfigs.length > 0) {
        // Round-robin: pick the next Gmail account in rotation
        const config = gmailConfigs[GMAIL_ACCOUNT_INDEX % gmailConfigs.length];
        GMAIL_ACCOUNT_INDEX = (GMAIL_ACCOUNT_INDEX + 1) % gmailConfigs.length;
        return config;
    }
    return {
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        user: defaultSmtpUser,
        pass: defaultSmtpPass,
        from: process.env.SMTP_FROM || 'Code Evaluator'
    };
}

function upgradeToTLS(socket, host) {
    return new Promise((resolve, reject) => {
        const tlsSocket = tls.connect({ socket, host, rejectUnauthorized: false }, () => {
            resolve(tlsSocket);
        });
        tlsSocket.on('error', reject);
    });
}

// HTTP-based email via Resend API (works on cloud platforms that block SMTP port 587)
async function sendOTPViaResend(email, otp, apiKey) {
    const fromAddress = process.env.RESEND_FROM || 'Code Evaluator <onboarding@resend.dev>';
    const payload = JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: 'Your OTP Code',
        html: `<html><body><h2>Your OTP Code: ${otp}</h2><p>Expires in 5 minutes.</p></body></html>`
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.resend.com',
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✓ OTP sent to ${email} via Resend API`);
                    resolve(true);
                } else {
                    console.error(`[Resend] HTTP ${res.statusCode}: ${data}`);
                    resolve(false);
                }
            });
        });
        req.on('error', (err) => {
            console.error('[Resend] Request error:', err.message);
            resolve(false);
        });
        req.setTimeout(10000, () => {
            req.destroy();
            console.error('[Resend] Timeout');
            resolve(false);
        });
        req.write(payload);
        req.end();
    });
}

// Gmail API via OAuth2 (HTTPS — works on all cloud platforms, no SMTP port needed)
// Round-robin index for Gmail API accounts
let GMAIL_API_INDEX = 0;

// Get all Gmail API account configs (parsed from semicolon-separated env vars)
function getAllGmailApiConfigs() {
    const clientIds = parseList(process.env.GMAIL_CLIENT_ID);
    const clientSecrets = parseList(process.env.GMAIL_CLIENT_SECRET);
    const refreshTokens = parseList(process.env.GMAIL_REFRESH_TOKEN);
    // Sender emails: prefer GMAIL_API_USER, fall back to GMAIL_SMTP_USER
    const senderEmails = parseList(process.env.GMAIL_API_USER || process.env.GMAIL_SMTP_USER);

    const configs = [];
    const count = Math.min(clientIds.length, clientSecrets.length, refreshTokens.length, senderEmails.length);
    for (let i = 0; i < count; i++) {
        configs.push({
            clientId: clientIds[i],
            clientSecret: clientSecrets[i],
            refreshToken: refreshTokens[i],
            senderEmail: senderEmails[i]
        });
    }
    return configs;
}

// Send via Gmail API using a specific account config
async function sendViaGmailApiAccount(config, email, otp) {
    const { clientId, clientSecret, refreshToken, senderEmail } = config;

    // Step 1: Get access token from refresh token
    const tokenPayload = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&refresh_token=${encodeURIComponent(refreshToken)}&grant_type=refresh_token`;

    const accessToken = await new Promise((resolve) => {
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(tokenPayload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.access_token || null);
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
        req.write(tokenPayload);
        req.end();
    });

    if (!accessToken) {
        console.error(`[Gmail API] Failed to get access token for ${senderEmail}`);
        return { success: false, quotaExceeded: false };
    }

    // Step 2: Build the email
    const rawEmail = [
        `From: "Code Evaluator" <${senderEmail}>`,
        `To: ${email}`,
        `Subject: Your OTP Code`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        `<html><body><h2>Your OTP Code: ${otp}</h2><p>Expires in 5 minutes.</p></body></html>`
    ].join('\r\n');

    const base64Email = Buffer.from(rawEmail)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const sendPayload = JSON.stringify({ raw: base64Email });

    // Step 3: Send via Gmail API
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'gmail.googleapis.com',
            path: '/gmail/v1/users/me/messages/send',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(sendPayload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✓ OTP sent to ${email} via Gmail API (sender: ${senderEmail})`);
                    resolve({ success: true, quotaExceeded: false });
                } else {
                    // Detect quota errors (429 = rate limit, 403 may also indicate quota)
                    const isQuotaError = res.statusCode === 429 ||
                        (res.statusCode === 403 && /quota|limit|rate/i.test(data));
                    console.error(`[Gmail API] ${senderEmail} -> HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
                    resolve({ success: false, quotaExceeded: isQuotaError });
                }
            });
        });
        req.on('error', (err) => {
            console.error(`[Gmail API] ${senderEmail} request error:`, err.message);
            resolve({ success: false, quotaExceeded: false });
        });
        req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, quotaExceeded: false }); });
        req.write(sendPayload);
        req.end();
    });
}

// Try sending via Gmail API, rotating through all configured accounts on failure
async function sendOTPViaGmailAPI(email, otp) {
    const configs = getAllGmailApiConfigs();
    if (configs.length === 0) return false;

    // Try each account starting from the round-robin index
    for (let i = 0; i < configs.length; i++) {
        const idx = (GMAIL_API_INDEX + i) % configs.length;
        const config = configs[idx];
        console.log(`[Gmail API] Attempt ${i + 1}/${configs.length} using ${config.senderEmail}`);

        const result = await sendViaGmailApiAccount(config, email, otp);
        if (result.success) {
            // Advance index for next call (load balancing)
            GMAIL_API_INDEX = (idx + 1) % configs.length;
            return true;
        }

        if (i < configs.length - 1) {
            console.log(`[Gmail API] ${config.senderEmail} failed${result.quotaExceeded ? ' (quota)' : ''} — trying next account`);
        }
    }

    console.error('[Gmail API] All accounts failed');
    return false;
}

async function sendOTPEmail(email, otp) {
    console.log(`[sendOTPEmail] Attempting to send OTP to ${email}`);
    // Try Gmail API first (HTTPS — works on all cloud platforms)
    try {
        const sentGmailApi = await sendOTPViaGmailAPI(email, otp);
        if (sentGmailApi) return true;
    } catch (err) {
        console.error('[Gmail API] Error:', err.message);
    }

    // Try Resend API (HTTPS fallback)
    const resendKey = process.env.RESEND_API_KEY || '';
    if (resendKey) {
        try {
            const sent = await sendOTPViaResend(email, otp, resendKey);
            if (sent) return true;
        } catch (err) {
            console.error('[Resend] Failed:', err.message);
        }
    }

    // Fallback to SMTP — try each Gmail account in turn (handles per-account quota limits)
    const isGmailRecipient = email.toLowerCase().endsWith('@gmail.com');
    const defaultSmtpUser = process.env.SMTP_USER || '';
    const defaultSmtpPass = process.env.SMTP_PASS || '';
    const useGmailPool = isGmailRecipient || !defaultSmtpUser || !defaultSmtpPass;

    let smtpAttempts = [];
    if (useGmailPool) {
        const gmailConfigs = getAllGmailConfigs();
        if (gmailConfigs.length === 0) {
            console.log(`[SMTP] No Gmail credentials configured. [Console Fallback] OTP for ${email}: ${otp}`);
            return false;
        }
        // Start from the round-robin index, then try the rest as fallback
        for (let i = 0; i < gmailConfigs.length; i++) {
            smtpAttempts.push(gmailConfigs[(GMAIL_ACCOUNT_INDEX + i) % gmailConfigs.length]);
        }
        // Advance the round-robin index for the next call
        GMAIL_ACCOUNT_INDEX = (GMAIL_ACCOUNT_INDEX + 1) % gmailConfigs.length;
    } else {
        smtpAttempts.push({
            host: process.env.SMTP_HOST || 'smtp.office365.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            user: defaultSmtpUser,
            pass: defaultSmtpPass,
            from: process.env.SMTP_FROM || 'Code Evaluator'
        });
    }

    for (let i = 0; i < smtpAttempts.length; i++) {
        const smtpConfig = smtpAttempts[i];
        console.log(`[sendOTPEmail] SMTP attempt ${i + 1}/${smtpAttempts.length}: host=${smtpConfig.host}, user=${smtpConfig.user}`);

        const messageBody = [
            `From: "${smtpConfig.from}" <${smtpConfig.user}>`,
            `To: ${email}`,
            `Subject: Your OTP Code`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=UTF-8`,
            ``,
            `<html><body><h2>Your OTP Code: ${otp}</h2><p>Expires in 5 minutes.</p></body></html>`
        ].join('\r\n');

        // Try port 465 first
        console.log(`[sendOTPEmail] Trying SMTP port 465 with ${smtpConfig.user}...`);
        const sent465 = await sendViaSMTP465(smtpConfig, email, otp, messageBody);
        if (sent465) return true;

        // Fallback to port 587
        console.log(`[sendOTPEmail] Trying SMTP port 587 with ${smtpConfig.user}...`);
        const sent587 = await sendViaSMTP587(smtpConfig, email, otp, messageBody);
        if (sent587) return true;

        if (i < smtpAttempts.length - 1) {
            console.log(`[sendOTPEmail] Account ${smtpConfig.user} failed (likely quota). Trying next account...`);
        }
    }

    console.log(`[Console Fallback] OTP for ${email}: ${otp}`);
    return false;
}

// Helper: check if an SMTP response line is the FINAL line of a multi-line reply.
// Multi-line replies use "250-..." for continuation and "250 ..." (space) for the last line.
function isSmtpFinalLine(line) {
    return /^\d{3} /.test(line) || /^\d{3}$/.test(line);
}

// Helper: run an SMTP conversation over a socket using a state machine
function runSmtpSession(activeSocket, smtpConfig, email, messageBody, label, startStep = 0) {
    return new Promise((resolve) => {
        let resolved = false;
        let buffer = '';
        let step = startStep;
        const debug = (msg) => console.log(`[${label}] ${msg}`);

        debug(`Session started at step ${startStep}`);

        const done = (success, reason) => {
            if (!resolved) {
                resolved = true;
                debug(`Session ended: ${reason || (success ? 'success' : 'failed')}`);
                resolve(success);
            }
        };

        const onData = (data) => {
            const text = data.toString();
            debug(`<- received: ${text.replace(/\r\n/g, ' | ').trim()}`);
            buffer += text;
            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const code = trimmed.substring(0, 3);

                // For multi-line responses (EHLO at step 1 and step 3 after-TLS), wait for final line
                if ((step === 1 || step === 3) && !isSmtpFinalLine(trimmed)) {
                    debug(`(skipping continuation line at step ${step})`);
                    continue;
                }

                try {
                    if (step === 0) { // Greeting (220)
                        if (code === '220') {
                            debug(`-> EHLO localhost`);
                            activeSocket.write('EHLO localhost\r\n');
                            step = 1;
                        }
                    } else if (step === 1) { // EHLO final response (250)
                        if (code === '250') {
                            debug(`-> AUTH LOGIN`);
                            activeSocket.write('AUTH LOGIN\r\n');
                            step = 2;
                        }
                    } else if (step === 2) { // AUTH (334 - send username)
                        if (code === '334') {
                            debug(`-> [base64 username]`);
                            activeSocket.write(Buffer.from(smtpConfig.user.trim()).toString('base64') + '\r\n');
                            step = 3;
                        }
                    } else if (step === 3) { // Username response (334 - send password)
                        if (code === '334') {
                            debug(`-> [base64 password]`);
                            activeSocket.write(Buffer.from(smtpConfig.pass.trim()).toString('base64') + '\r\n');
                            step = 4;
                        }
                    } else if (step === 4) { // Auth result
                        if (code === '235') {
                            debug(`✓ Authenticated. -> MAIL FROM`);
                            activeSocket.write(`MAIL FROM:<${smtpConfig.user}>\r\n`);
                            step = 5;
                        } else {
                            debug(`✗ Auth failed: ${trimmed}`);
                            activeSocket.end();
                            done(false, 'auth failed');
                            return;
                        }
                    } else if (step === 5) { // MAIL FROM (250)
                        if (code === '250') {
                            debug(`-> RCPT TO:<${email}>`);
                            activeSocket.write(`RCPT TO:<${email}>\r\n`);
                            step = 6;
                        }
                    } else if (step === 6) { // RCPT TO (250)
                        if (code === '250') {
                            debug(`-> DATA`);
                            activeSocket.write('DATA\r\n');
                            step = 7;
                        }
                    } else if (step === 7) { // DATA (354)
                        if (code === '354') {
                            debug(`-> [message body]`);
                            activeSocket.write(messageBody + '\r\n.\r\n');
                            step = 8;
                        }
                    } else if (step === 8) { // Message accepted (250)
                        if (code === '250') {
                            debug(`-> QUIT`);
                            activeSocket.write('QUIT\r\n');
                            activeSocket.end();
                            console.log(`✓ OTP sent to ${email} via SMTP (${label})`);
                            done(true, 'message sent');
                            return;
                        }
                    }
                } catch (err) {
                    console.error(`[${label}] Error:`, err.message);
                    activeSocket.destroy();
                    done(false, 'exception: ' + err.message);
                    return;
                }
            }
        };

        // Attach listeners synchronously
        activeSocket.on('data', onData);

        activeSocket.on('error', (err) => {
            debug(`Socket error: ${err.message}`);
            done(false, 'socket error: ' + err.message);
        });

        activeSocket.on('close', () => {
            debug(`Socket closed (was at step ${step})`);
            done(false, 'socket closed at step ' + step);
        });
    });
}

// SMTP via port 465 — direct TLS connection (no STARTTLS upgrade needed)
function sendViaSMTP465(smtpConfig, email, otp, messageBody) {
    return new Promise((resolve) => {
        let resolved = false;
        let tlsSocket;

        const timeout = setTimeout(() => {
            if (!resolved) {
                console.log('[SMTP-465] Timeout');
                resolved = true;
                try { tlsSocket.destroy(); } catch (e) {}
                resolve(false);
            }
        }, 15000);

        try {
            console.log(`[SMTP-465] Connecting to ${smtpConfig.host}:465...`);
            tlsSocket = tls.connect(465, smtpConfig.host, { rejectUnauthorized: false });

            tlsSocket.once('secureConnect', () => {
                console.log(`[SMTP-465] TLS secure connection established`);
                runSmtpSession(tlsSocket, smtpConfig, email, messageBody, 'SMTP-465').then((success) => {
                    clearTimeout(timeout);
                    if (!resolved) { resolved = true; resolve(success); }
                });
            });

            tlsSocket.on('error', (err) => {
                clearTimeout(timeout);
                if (!resolved) { resolved = true; console.error('[SMTP-465] Connection error:', err.message); resolve(false); }
            });
        } catch (err) {
            clearTimeout(timeout);
            console.error('[SMTP-465] Failed:', err.message);
            resolve(false);
        }
    });
}

// SMTP via port 587 — STARTTLS upgrade from plain to TLS
function sendViaSMTP587(smtpConfig, email, otp, messageBody) {
    return new Promise((resolve) => {
        let socket;
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                console.log('[SMTP-587] Timeout');
                resolved = true;
                try { socket.destroy(); } catch (e) {}
                resolve(false);
            }
        }, 15000);

        try {
            socket = net.createConnection(smtpConfig.port, smtpConfig.host, () => {});

            let buffer = '';
            let step = 0; // 0=greeting, 1=EHLO response, 2=STARTTLS response

            socket.on('data', (data) => {
                buffer += data.toString();
                const lines = buffer.split('\r\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const code = trimmed.substring(0, 3);

                    if (step === 1 && !isSmtpFinalLine(trimmed)) continue;

                    if (step === 0 && code === '220') {
                        socket.write('EHLO localhost\r\n');
                        step = 1;
                    } else if (step === 1 && code === '250') {
                        socket.write('STARTTLS\r\n');
                        step = 2;
                    } else if (step === 2 && code === '220') {
                        // CRITICAL FIX: Attach data listener to the NEW tlsSocket (not the old plain socket)
                        const tlsSocket = tls.connect({ socket: socket, host: smtpConfig.host, rejectUnauthorized: false }, () => {
                            tlsSocket.write('EHLO localhost\r\n');
                            // Start auth session at step 1 (we already sent EHLO; next response is 250 EHLO reply)
                            runSmtpSession(tlsSocket, smtpConfig, email, messageBody, 'SMTP-587', 1).then((success) => {
                                clearTimeout(timeout);
                                if (!resolved) { resolved = true; resolve(success); }
                            });
                        });

                        tlsSocket.on('error', (err) => {
                            clearTimeout(timeout);
                            if (!resolved) { resolved = true; console.error('[SMTP-587] TLS error:', err.message); resolve(false); }
                        });

                        return; // tlsSocket handles the rest
                    }
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timeout);
                if (!resolved) { resolved = true; console.error('[SMTP-587] Connection error:', err.message); resolve(false); }
            });

            socket.on('close', () => {
                clearTimeout(timeout);
                if (!resolved) { resolved = true; resolve(false); }
            });
        } catch (err) {
            clearTimeout(timeout);
            console.error('[SMTP-587] Failed:', err.message);
            resolve(false);
        }
    });
}


// ==================== GEMINI API ====================
function getCurrentGeminiApiKey() { return GEMINI_API_KEYS[GEMINI_KEY_INDEX % GEMINI_API_KEYS.length] || ''; }
function getNextGeminiApiKey() { GEMINI_KEY_INDEX = (GEMINI_KEY_INDEX + 1) % GEMINI_API_KEYS.length; return getCurrentGeminiApiKey(); }
function getNextGeminiModel() { GEMINI_MODEL_INDEX = (GEMINI_MODEL_INDEX + 1) % GEMINI_MODELS.length; return GEMINI_MODELS[GEMINI_MODEL_INDEX]; }

async function callGemini(prompt, mode, language, userCode, lastError, questionTitle, questionDescription, model, apiKey) {
    const usedModel = model || GEMINI_MODEL;
    const usedKey = apiKey || getCurrentGeminiApiKey();
    if (!usedKey) {
        return { suggestions: ['Gemini API key not set.'], warnings: [], confidence: 'low', revisedCode: userCode };
    }
    const userPrompt = buildAIUserPrompt(questionTitle, questionDescription, language, userCode, lastError);
    const payload = JSON.stringify({
        contents: [{ parts: [{ text: AI_SYSTEM_PROMPT + '\n\n' + userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    });
    const GEMINI_TIMEOUT_MS = 30000;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            req.destroy();
            resolve({ suggestions: ['Gemini API timed out.'], warnings: [], confidence: 'low', revisedCode: userCode });
        }, GEMINI_TIMEOUT_MS);

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${usedModel}:generateContent?key=${usedKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            rejectUnauthorized: false
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        const msg = json.error.message || JSON.stringify(json.error);
                        const quotaError = /quota|rate|limit|429|resource.*exhausted/i.test(msg);
                        const modelNotFound = /not found|404|invalid model/i.test(msg);
                        resolve({ suggestions: ['Gemini API error: ' + msg], warnings: [], confidence: 'low', revisedCode: userCode, quotaError, modelNotFound, usedModel });
                        return;
                    }
                    const content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    const percentage = extractPercentage(content);
                    const parsed = parseAIFeedback(content);
                    resolve({ suggestions: [content], warnings: [], confidence: 'high', revisedCode: userCode, percentage, covered: parsed.covered, missed: parsed.missed, usedModel });
                } catch (e) {
                    resolve({ suggestions: ['Gemini API parse error: ' + e.message], warnings: [], confidence: 'low', revisedCode: userCode, usedModel });
                }
            });
        });
        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ suggestions: ['Gemini API failed: ' + err.message], warnings: [], confidence: 'low', revisedCode: userCode, usedModel });
        });
        req.write(payload);
        req.end();
    });
}

// ==================== CLAUDE API ====================
async function callClaude(prompt, mode, language, userCode, lastError, questionTitle, questionDescription) {
    if (!USE_CLAUDE || (!CLAUDE_API_KEY && !CLAUDE_BASE_URL)) {
        return { suggestions: ['Claude not configured.'], warnings: [], confidence: 'low', revisedCode: userCode };
    }

    const userPrompt = buildAIUserPrompt(questionTitle, questionDescription, language, userCode, lastError);
    const messages = [
        { role: 'user', content: AI_SYSTEM_PROMPT + '\n\n' + userPrompt }
    ];
    const body = JSON.stringify({
        model: CLAUDE_MODEL,
        messages,
        max_tokens: 1024
    });

    const hostname = CLAUDE_BASE_URL ? new URL(CLAUDE_BASE_URL).hostname : 'api.anthropic.com';
    const basePath = CLAUDE_BASE_URL ? new URL(CLAUDE_BASE_URL).pathname : '';
    const apiPath = basePath ? basePath + '/v1/messages' : '/v1/messages';
    const portNum = CLAUDE_BASE_URL ? (new URL(CLAUDE_BASE_URL).port || 443) : 443;
    const useHttps = CLAUDE_BASE_URL ? new URL(CLAUDE_BASE_URL).protocol === 'https:' : true;
    const httpModule = useHttps ? https : http;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            req.destroy();
            resolve({ suggestions: ['Claude API timed out.'], warnings: [], confidence: 'low', revisedCode: userCode });
        }, CLAUDE_TIMEOUT_MS);

        const req = httpModule.request({
            hostname,
            port: portNum,
            path: apiPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            rejectUnauthorized: false
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        console.error('[Claude] API error:', json.error.message || JSON.stringify(json.error));
                        resolve({ suggestions: ['Claude API error: ' + (json.error.message || 'Unknown error')], warnings: [], confidence: 'low', revisedCode: userCode });
                        return;
                    }
                    const content = json.content?.[0]?.text || '';
                    const percentage = extractPercentage(content);
                    resolve({ suggestions: [content], warnings: [], confidence: 'high', revisedCode: userCode, percentage });
                } catch (e) {
                    resolve({ suggestions: ['Claude API error: ' + e.message], warnings: [], confidence: 'low', revisedCode: userCode });
                }
            });
        });
        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ suggestions: ['Claude API request failed: ' + err.message], warnings: [], confidence: 'low', revisedCode: userCode });
        });
        req.write(body);
        req.end();
    });
}

// ==================== SHARED AI SYSTEM PROMPT ====================
const AI_SYSTEM_PROMPT = `You are a code correctness evaluator for a coding assessment. Your job is to determine what percentage (0-100) of the solution is correct.

CRITICAL CONTEXT: These are coding assessment problems with SPECIFIC, FIXED inputs (not general-purpose functions). The student writes a program that works for the given input described in the problem.

Score using these 7 categories (total = 100):

1. OUTPUT CORRECTNESS (25 pts): Does the code produce the correct output for the given input? Does the output format match? Are input values correctly initialized?
2. LOGIC & ALGORITHM (20 pts): Is the control flow correct (loops, conditions, recursion)? Are operators used correctly? Is data handled properly? No semantic errors (e.g., == vs .equals() for Strings in Java)?
3. CODE STRUCTURE (10 pts): Proper class/function definition? Main method? Modular design? Appropriate variable declarations?
4. PROBLEM RELEVANCE (15 pts): Does the approach match the problem? Uses appropriate algorithms/data structures for this specific problem type?
5. CODE QUALITY (10 pts): Good naming conventions (camelCase for Java, snake_case for Python)? Readable code? No dead code or unused imports? Appropriate code length?
6. EDGE CASES (10 pts): Null/None checks? Empty input guards? Error handling (try-catch/try-except)? Boundary awareness? Type safety?
7. EFFICIENCY (10 pts): Reasonable time complexity? No unnecessary nested loops? No anti-patterns (String concat in Java loops, ArrayList.contains in loops)? Good algorithm choice?

Scoring bands:
- 90-100%: Correct output, solid logic, good structure, relevant approach, quality code, handles edge cases, efficient.
- 75-89%: Correct output, minor issues in 1-2 categories.
- 50-74%: Partially correct, logical errors or wrong approach.
- 25-49%: Significant logic errors, mostly broken.
- 0-24%: Does not solve the problem, or just hardcodes the output.

IMPORTANT:
- These problems have FIXED inputs. Do NOT penalize for not handling inputs that are NOT part of the problem description.
- If the code correctly solves the stated problem using real logic (not hardcoding), it deserves 90%+.
- Hardcoded output (just printing the answer without logic) = 0%.

You MUST respond in EXACTLY this format:
SCORE: <number 0-100>
COVERED:
- <what the code does correctly, one point per line>
- <another covered aspect>
MISSED:
- <what is actually wrong or could be improved, one point per line>
- <use "None" if the solution is complete and correct>

Example response for a correct solution:
SCORE: 95
COVERED:
- Correctly solves the problem with proper algorithm
- Good code structure with class and main method
- Uses appropriate data structures (HashMap for frequency counting)
- Descriptive variable names and clean formatting
- Output matches expected format
MISSED:
- None`;

function buildAIUserPrompt(questionTitle, questionDescription, language, userCode, lastError) {
    return `Question: ${questionTitle}
Description: ${questionDescription}
Language: ${language}

Student's code:
\`\`\`
${userCode}
\`\`\`
${lastError ? 'Error encountered: ' + lastError + '\n' : ''}
Evaluate this code for the SPECIFIC problem described above. Does it correctly solve the problem using real logic (not hardcoded output)? Respond with SCORE, COVERED, and MISSED.`;
}

function extractPercentage(content) {
    const scoreMatch = String(content).match(/SCORE\s*:\s*(\d{1,3})/i);
    if (scoreMatch) {
        return Math.max(0, Math.min(100, parseInt(scoreMatch[1], 10)));
    }
    const match = String(content).match(/(\d{1,3})\s*%/);
    if (match) {
        return Math.max(0, Math.min(100, parseInt(match[1], 10)));
    }
    return null;
}

function parseAIFeedback(content) {
    const result = { covered: [], missed: [], explanation: '' };
    if (!content) return result;

    const text = String(content);

    const scoreMatch = text.match(/SCORE\s*:\s*(\d{1,3})/i);
    if (scoreMatch) result.percentage = Math.max(0, Math.min(100, parseInt(scoreMatch[1], 10)));

    const coveredMatch = text.match(/COVERED\s*:([\s\S]*?)(?=MISSED\s*:|$)/i);
    if (coveredMatch) {
        result.covered = coveredMatch[1].split('\n')
            .map(l => l.replace(/^[\s\-*•]+/, '').trim())
            .filter(l => l.length > 0 && !/^none$/i.test(l));
    }

    const missedMatch = text.match(/MISSED\s*:([\s\S]*?)$/i);
    if (missedMatch) {
        result.missed = missedMatch[1].split('\n')
            .map(l => l.replace(/^[\s\-*•]+/, '').trim())
            .filter(l => l.length > 0 && !/^none$/i.test(l));
    }

    result.explanation = text;
    return result;
}

// ==================== OPENAI API ====================
async function callOpenAI(prompt, mode, language, userCode, lastError, questionTitle, questionDescription) {
    if (!OPENAI_API_KEY) {
        return { suggestions: ['OpenAI API key not set. Set OPENAI_API_KEY in .env'], warnings: [], confidence: 'low', revisedCode: userCode };
    }

    const userPrompt = buildAIUserPrompt(questionTitle, questionDescription, language, userCode, lastError);
    const messages = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
    ];
    const reqBody = JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        max_tokens: 1024,
        temperature: 0.5
    });

    const OPENAI_TIMEOUT_MS = 30000;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            req.destroy();
            resolve({ suggestions: ['OpenAI API timed out. Please try again.'], warnings: [], confidence: 'low', revisedCode: userCode });
        }, OPENAI_TIMEOUT_MS);

        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            rejectUnauthorized: false
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        resolve({ suggestions: ['OpenAI API error: ' + (json.error.message || JSON.stringify(json.error))], warnings: [], confidence: 'low', revisedCode: userCode });
                        return;
                    }
                    const content = json.choices?.[0]?.message?.content || '';
                    const percentage = extractPercentage(content);
                    resolve({ suggestions: [content], warnings: [], confidence: 'high', revisedCode: userCode, percentage });
                } catch (e) {
                    resolve({ suggestions: ['OpenAI API error: ' + e.message], warnings: [], confidence: 'low', revisedCode: userCode });
                }
            });
        });
        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ suggestions: ['OpenAI API request failed: ' + err.message], warnings: [], confidence: 'low', revisedCode: userCode });
        });
        req.write(reqBody);
        req.end();
    });
}

// ==================== OLLAMA (LOCAL AI) ====================
async function callOllama(prompt, mode, language, userCode, lastError, questionTitle, questionDescription) {
    const userPrompt = buildAIUserPrompt(questionTitle, questionDescription, language, userCode, lastError);
    const messages = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
    ];
    const body = JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false
    });

    const ollamaUrl = new URL(OLLAMA_BASE_URL + '/api/chat');
    const OLLAMA_TIMEOUT_MS = 120000;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            req.destroy();
            resolve({ suggestions: ['Ollama took too long to respond. Try a smaller model like phi3.'], warnings: [], confidence: 'low', revisedCode: userCode });
        }, OLLAMA_TIMEOUT_MS);

        const req = http.request({
            hostname: ollamaUrl.hostname,
            port: ollamaUrl.port,
            path: ollamaUrl.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const json = JSON.parse(data);
                    const content = json.message?.content || '';
                    const percentage = extractPercentage(content);
                    resolve({ suggestions: [content], warnings: [], confidence: 'high', revisedCode: userCode, percentage });
                } catch (e) {
                    resolve({ suggestions: ['Ollama API error: ' + e.message], warnings: [], confidence: 'low', revisedCode: userCode });
                }
            });
        });
        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ suggestions: ['Ollama is not running. Start it with: ollama serve'], warnings: [], confidence: 'low', revisedCode: userCode });
        });
        req.write(body);
        req.end();
    });
}

// ==================== STARTER TEMPLATES ====================
function buildJavaStarterTemplate() {
    return `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        // TODO: Write your solution here
    }
}`;
}

function buildPythonStarterTemplate() {
    return `# Write your solution here
def solve():
    pass`;
}

// ==================== COMPREHENSIVE CODE EVALUATION ENGINE ====================
// 7-Category Scoring: Output(25) + Logic(20) + Structure(10) + Relevance(15) + Quality(10) + EdgeCases(10) + Efficiency(10) = 100

function runRuleBasedAgentAssist(question, userCode, language, mode = 'percentage') {
    const title = (question.title || '').toLowerCase();
    const desc = (question.description || '').toLowerCase();
    const difficulty = (question.difficulty || 'moderate').toLowerCase();
    const code = userCode || '';
    const codeLower = code.toLowerCase();
    const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#') && !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
    const codeNoComments = lines.join('\n');

    const strengths = [];
    const issues = [];
    let score = 0;

    // Step 0: Hardcoded output detection (score = 0)
    const isHardcoded = detectHardcodedOutput(code, language);
    if (isHardcoded) {
        return {
            percentage: 0,
            explanation: 'Hardcoded output detected — the code prints a fixed answer without implementing actual logic to solve the problem.',
            covered: [],
            missed: ['Hardcoded output — no algorithm implementation'],
            issues: ['Hardcoded output — no algorithm implementation'],
            agentUsed: 'enhanced-rule-engine'
        };
    }

    // Step 1: Output Correctness (0–25 pts) — Did the code produce the right answer?
    const outputScore = scoreOutputCorrectness(question, code, language);
    score += outputScore.points;
    strengths.push(...outputScore.strengths);
    issues.push(...outputScore.issues);

    // Step 2: Logic & Algorithm Correctness (0–20 pts) — Is the logic semantically correct?
    const logicScore = scoreLogicCorrectness(code, language, title, desc);
    score += logicScore.points;
    strengths.push(...logicScore.strengths);
    issues.push(...logicScore.issues);

    // Step 3: Code Structure (0–10 pts) — Proper class/function organization
    const structureScore = scoreStructure(code, language, difficulty);
    score += structureScore.points;
    strengths.push(...structureScore.strengths);
    issues.push(...structureScore.issues);

    // Step 4: Problem-Specific Relevance (0–15 pts) — Does approach match the problem?
    const problemScore = scoreProblemRelevance(code, language, title, desc);
    score += problemScore.points;
    strengths.push(...problemScore.strengths);
    issues.push(...problemScore.issues);

    // Step 5: Code Quality & Style (0–10 pts) — Naming, readability, conventions
    const qualityScore = scoreCodeQuality(code, language, lines, difficulty);
    score += qualityScore.points;
    strengths.push(...qualityScore.strengths);
    issues.push(...qualityScore.issues);

    // Step 6: Edge Cases & Robustness (0–10 pts) — Error handling, null checks, boundary guards
    const edgeCaseScore = scoreEdgeCases(code, language, title, difficulty);
    score += edgeCaseScore.points;
    strengths.push(...edgeCaseScore.strengths);
    issues.push(...edgeCaseScore.issues);

    // Step 7: Efficiency & Complexity (0–10 pts) — Time/space complexity, anti-patterns
    const efficiencyScore = scoreEfficiency(code, language, title);
    score += efficiencyScore.points;
    strengths.push(...efficiencyScore.strengths);
    issues.push(...efficiencyScore.issues);

    score = Math.max(0, Math.min(100, Math.round(score)));

    const topStrengths = strengths.slice(0, 4).join('; ');
    const topIssues = issues.slice(0, 3).join('; ');
    let explanation = '';
    if (score >= 90) explanation = `Excellent solution. ${topStrengths}.`;
    else if (score >= 75) explanation = `Good solution. ${topStrengths}. Minor: ${topIssues || 'none'}.`;
    else if (score >= 50) explanation = `Partial solution. ${topStrengths}. Issues: ${topIssues || 'minor'}.`;
    else explanation = `Needs improvement. ${topIssues || 'Missing core logic'}.`;

    return {
        percentage: score,
        explanation,
        covered: strengths.slice(0, 6),
        missed: issues.slice(0, 6),
        issues,
        agentUsed: 'enhanced-rule-engine',
        breakdown: {
            output: outputScore.points,
            logic: logicScore.points,
            structure: structureScore.points,
            relevance: problemScore.points,
            quality: qualityScore.points,
            edgeCases: edgeCaseScore.points,
            efficiency: efficiencyScore.points
        }
    };
}

// --- Hardcoded output detection ---
function detectHardcodedOutput(code, language) {
    let userLogic = code;
    if (language === 'java') {
        userLogic = userLogic
            .replace(/import\s+[\w.*]+;/g, '')
            .replace(/public\s+class\s+\w+\s*\{/g, '')
            .replace(/public\s+static\s+void\s+main\s*\([^)]*\)\s*\{/g, '')
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\}\s*$/gm, '')
            .trim();
        const prints = (userLogic.match(/System\.out\.print(ln)?\s*\(/g) || []).length;
        if (prints === 0) return false;
        const hasLoops = /for\s*\(|while\s*\(|\.forEach|\.stream/.test(userLogic);
        const hasConditions = /if\s*\(|else\s|switch\s*\(|\?.*:/.test(userLogic);
        const hasDataStructures = /new\s+(ArrayList|HashMap|HashSet|LinkedHashMap|TreeMap|TreeSet|LinkedList|PriorityQueue|StringBuilder)/.test(userLogic);
        const hasMethodCalls = /\.(split|substring|charAt|toCharArray|contains|indexOf|replaceAll|replace|length|sort|add|put|get|remove|size|isEmpty|trim|toLowerCase|toUpperCase)\s*\(/.test(userLogic);
        const hasMath = /Math\.|%\s*\d|\+\+|--(?!\s)|\+=|-=|\*=|\^=/.test(userLogic);
        const hasArrays = /\w+\s*\[\s*\w+\s*\]|new\s+\w+\s*\[/.test(userLogic);
        const hasInput = /Scanner|BufferedReader|System\.in/.test(userLogic);
        const hasUserMethods = /(?:public|private|static)\s+(?!void\s+main)\w+\s+\w+\s*\(/.test(code);
        const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(userLogic);
        // Count typed variable declarations, including comma-separated (e.g., int a = 5, b = 10)
        let varDeclCount = 0;
        const declMatches = userLogic.match(/(int|String|long|double|boolean|char|float|var)\s+\w+\s*=[^;]*/g) || [];
        declMatches.forEach(decl => {
            // Count comma-separated variables within a single declaration
            varDeclCount += (decl.split(',').length);
        });
        const hasVariableLogic = varDeclCount >= 2;
        // Detect arithmetic reassignment patterns: a = a + b, a = a - b, a = a ^ b, etc.
        const hasArithmeticAssignment = /\w+\s*=\s*\w+\s*[+\-\*\/\^%]\s*\w+/.test(userLogic);
        const onlyPrints = userLogic.replace(/System\.out\.print(ln)?\s*\([\s\S]*?\);?/g, '').trim().length === 0;
        if ((!hasLoops && !hasConditions && !hasDataStructures && !hasMethodCalls && !hasMath && !hasArrays && !hasInput && !hasUserMethods && !hasRecursion && !hasVariableLogic && !hasArithmeticAssignment) || onlyPrints) return true;
    } else if (language === 'python') {
        userLogic = userLogic
            .replace(/#.*$/gm, '')
            .replace(/'''[\s\S]*?'''/g, '').replace(/"""[\s\S]*?"""/g, '')
            .trim();
        const prints = (userLogic.match(/print\s*\(/g) || []).length;
        if (prints === 0) return false;
        const hasLoops = /for\s+\w+\s+in\s|while\s+/.test(userLogic);
        const hasConditions = /\bif\s+|\belse\s*:|elif\s+/.test(userLogic);
        const hasFunctions = (userLogic.match(/def\s+\w+\s*\(/g) || []).length > 0;
        const hasMethodCalls = /\.(split|replace|find|count|index|join|sort|sorted|append|add|strip|lower|upper|isdigit|isalpha|items|keys|values|pop|remove|insert|reverse|startswith|endswith)\s*\(/.test(userLogic);
        const hasComprehensions = /\[.*\bfor\b.*\bin\b.*\]|\{.*\bfor\b.*\bin\b.*\}/.test(userLogic);
        const hasBuiltins = /\b(len|range|enumerate|zip|map|filter|sum|min|max|abs|int|str|list|dict|set|sorted|reversed|ord|chr)\s*\(/.test(userLogic);
        const hasVariableLogic = (userLogic.match(/\w+\s*=\s*(?!.*print)/g) || []).length >= 2;
        const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(userLogic);
        // Detect arithmetic reassignment (a = a + b) and tuple swap (a, b = b, a)
        const hasArithmeticAssignment = /\w+\s*=\s*\w+\s*[+\-\*\/\^%]\s*\w+/.test(userLogic);
        const hasTupleSwap = /\w+\s*,\s*\w+\s*=\s*\w+\s*,\s*\w+/.test(userLogic);
        const onlyPrints = userLogic.replace(/print\s*\([\s\S]*?\)/g, '').trim().length === 0;
        if ((!hasLoops && !hasConditions && !hasFunctions && !hasMethodCalls && !hasComprehensions && !hasBuiltins && !hasVariableLogic && !hasRecursion && !hasArithmeticAssignment && !hasTupleSwap) || onlyPrints) return true;
    } else if (language === 'javascript') {
        userLogic = userLogic
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim();
        const prints = (userLogic.match(/console\.log\s*\(/g) || []).length;
        if (prints === 0) return false;
        const hasLoops = /for\s*\(|while\s*\(|\.forEach|\.map|\.filter|\.reduce/.test(userLogic);
        const hasConditions = /if\s*\(|else\s|switch\s*\(|\?.*:/.test(userLogic);
        const hasFunctions = /function\s+\w+|=>|\bclass\s/.test(userLogic);
        const hasMethodCalls = /\.(split|substring|charAt|includes|indexOf|replace|replaceAll|length|sort|push|pop|shift|unshift|splice|slice|join|trim|toLowerCase|toUpperCase|map|filter|reduce|find|some|every|keys|values|entries|reverse|repeat|startsWith|endsWith)\s*\(/.test(userLogic);
        const hasBuiltins = /\b(Math\.|parseInt|parseFloat|String\.|Number\.|Array\.|Object\.|JSON\.|Set|Map|new\s+Set|new\s+Map|isNaN|typeof)/.test(userLogic);
        const hasVariableLogic = (userLogic.match(/(const|let|var)\s+\w+\s*=/g) || []).length >= 2;
        const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(userLogic);
        const hasArithmeticAssignment = /\w+\s*=\s*\w+\s*[+\-\*\/\^%]\s*\w+/.test(userLogic);
        const hasDestructuring = /\[.*\]\s*=|\{.*\}\s*=|\.\.\.\./.test(userLogic);
        const onlyPrints = userLogic.replace(/console\.log\s*\([\s\S]*?\);?/g, '').trim().length === 0;
        if ((!hasLoops && !hasConditions && !hasFunctions && !hasMethodCalls && !hasBuiltins && !hasVariableLogic && !hasRecursion && !hasArithmeticAssignment && !hasDestructuring) || onlyPrints) return true;
    }
    return false;
}

// --- Output Correctness scoring (0-25 pts) ---
// Validates whether the code's logic would produce the correct output
function scoreOutputCorrectness(question, code, language) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const example = String(question.example || '');
    const template = language === 'java' ? (question.javaTemplate || '') : language === 'javascript' ? (question.javascriptTemplate || '') : (question.pythonTemplate || '');

    // 1. Has output statement (+5)
    const hasOutput = language === 'java' ? /System\.out\.print/.test(code) : language === 'javascript' ? /console\.log\s*\(/.test(code) : /\bprint\s*\(/.test(code);
    if (hasOutput) { points += 5; strengths.push('Has output statement'); }
    else { issues.push('No output statement found'); return { points: 0, strengths, issues }; }

    // 2. Output format matches expected pattern (+5)
    const outputMatch = example.match(/Output:\s*([\s\S]*)$/i);
    const expectedOutput = outputMatch ? outputMatch[1].trim() : '';
    if (expectedOutput) {
        // Check if key values from expected output appear in print statements
        const expectedTokens = expectedOutput.replace(/[^\w\d.*#@]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 0);
        const printStatements = language === 'java'
            ? (code.match(/System\.out\.print(?:ln)?\s*\([^)]*\)/g) || []).join(' ')
            : language === 'javascript'
            ? (code.match(/console\.log\s*\([^)]*\)/g) || []).join(' ')
            : (code.match(/print\s*\([^)]*\)/g) || []).join(' ');
        const tokenHits = expectedTokens.filter(t => printStatements.includes(t) || code.includes(t)).length;
        const tokenRatio = expectedTokens.length > 0 ? tokenHits / expectedTokens.length : 0;
        if (tokenRatio >= 0.5) { points += 5; strengths.push('Output format matches expected pattern'); }
        else if (tokenRatio > 0) { points += 2; }
        else { points += 1; issues.push('Output format may not match expected'); }
    } else { points += 3; }

    // 3. Logic alignment with reference template (+10)
    if (template) {
        const templateLogic = extractLogicSignature(template, language);
        const userLogic = extractLogicSignature(code, language);
        const alignmentScore = compareLogicSignatures(templateLogic, userLogic);
        if (alignmentScore >= 0.7) { points += 10; strengths.push('Logic aligns well with reference solution'); }
        else if (alignmentScore >= 0.4) { points += 6; strengths.push('Logic partially aligns with reference'); }
        else if (alignmentScore > 0) { points += 3; issues.push('Logic differs significantly from expected approach'); }
        else { points += 1; issues.push('Code approach may not match problem requirements'); }
    } else { points += 5; }

    // 4. Correct variable/data initialization from problem input (+5)
    const inputMatch = example.match(/Input:\s*([\s\S]*?)(?=Output:|$)/i);
    const inputText = inputMatch ? inputMatch[1].trim() : '';
    if (inputText) {
        const inputValues = inputText.match(/\d+|"[^"]*"|'[^']*'/g) || [];
        if (inputValues.length > 0) {
            const foundInCode = inputValues.filter(v => code.includes(v.replace(/['"]/g, ''))).length;
            const inputRatio = foundInCode / inputValues.length;
            if (inputRatio >= 0.5) { points += 5; strengths.push('Correctly initializes input data from problem'); }
            else if (inputRatio > 0) { points += 3; }
            else { points += 1; issues.push('Input data may not match problem specification'); }
        } else {
            // No numeric/quoted values — check if raw input text appears in code
            if (code.includes(inputText) || code.includes(inputText.toLowerCase()) || code.includes(inputText.toUpperCase())) {
                points += 5; strengths.push('Correctly initializes input data from problem');
            } else { points += 3; }
        }
    } else { points += 3; }

    return { points: Math.min(25, points), strengths, issues };
}

// Extract a "logic signature" from code: what operations, patterns, and control flow it uses
function extractLogicSignature(code, language) {
    const sig = {
        loops: 0, conditions: 0, assignments: 0, prints: 0,
        mathOps: 0, stringOps: 0, arrayOps: 0, dsOps: 0,
        functions: 0, recursion: false, sorting: false,
        keywords: new Set()
    };
    if (language === 'java') {
        sig.loops = (code.match(/for\s*\(|while\s*\(/g) || []).length;
        sig.conditions = (code.match(/if\s*\(|else|switch\s*\(/g) || []).length;
        sig.assignments = (code.match(/\w+\s*[+\-*\/]?=\s*/g) || []).length;
        sig.prints = (code.match(/System\.out\.print/g) || []).length;
        sig.mathOps = (code.match(/Math\.|%|\+\+|--|\+=|-=/g) || []).length;
        sig.stringOps = (code.match(/\.split|\.charAt|\.substring|\.replace|\.trim|\.toCharArray|\.length\(\)/g) || []).length;
        sig.arrayOps = (code.match(/\[\s*\w+\s*\]|\.get\(|\.set\(/g) || []).length;
        sig.dsOps = (code.match(/new\s+(ArrayList|HashMap|HashSet|LinkedHashMap|TreeMap|StringBuilder)/g) || []).length;
        sig.functions = (code.match(/(?:public|private|static)\s+\w+\s+\w+\s*\(/g) || []).length;
        sig.recursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(code);
        sig.sorting = /Arrays\.sort|Collections\.sort|\.sort\(/.test(code);
        // Extract key identifiers
        (code.match(/\b(for|while|if|else|switch|return|break|continue|new|try|catch)\b/g) || []).forEach(k => sig.keywords.add(k));
    } else if (language === 'javascript') {
        sig.loops = (code.match(/for\s*\(|while\s*\(|\.forEach\s*\(|\.map\s*\(/g) || []).length;
        sig.conditions = (code.match(/if\s*\(|else|switch\s*\(|\?.*:/g) || []).length;
        sig.assignments = (code.match(/\w+\s*[+\-*\/]?=\s*/g) || []).length;
        sig.prints = (code.match(/console\.log/g) || []).length;
        sig.mathOps = (code.match(/Math\.|%|\+\+|--|\+=|-=/g) || []).length;
        sig.stringOps = (code.match(/\.split|\.charAt|\.substring|\.replace|\.trim|\.includes|\.indexOf|\.slice|\.join/g) || []).length;
        sig.arrayOps = (code.match(/\[\s*\w+\s*\]|\.push|\.pop|\.shift|\.splice|\.filter|\.reduce/g) || []).length;
        sig.dsOps = (code.match(/new\s+(Set|Map)|Object\.(keys|values|entries)/g) || []).length;
        sig.functions = (code.match(/function\s+\w+\s*\(|=>|\bclass\s/g) || []).length;
        sig.recursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(code);
        sig.sorting = /\.sort\s*\(/.test(code);
        (code.match(/\b(for|while|if|else|switch|return|break|continue|new|try|catch|const|let|function)\b/g) || []).forEach(k => sig.keywords.add(k));
    } else {
        sig.loops = (code.match(/for\s+\w+\s+in|while\s+/g) || []).length;
        sig.conditions = (code.match(/\bif\s+|\belif\s+|\belse\s*:/g) || []).length;
        sig.assignments = (code.match(/\w+\s*[+\-*\/]?=\s*/g) || []).length;
        sig.prints = (code.match(/\bprint\s*\(/g) || []).length;
        sig.mathOps = (code.match(/%|\*\*|abs\(|pow\(/g) || []).length;
        sig.stringOps = (code.match(/\.split|\.replace|\.strip|\.join|\.find|\.count|\.lower|\.upper/g) || []).length;
        sig.arrayOps = (code.match(/\[\s*\w+\s*\]|\[\s*-?\d+\s*\]|\.append|\.extend|\.pop/g) || []).length;
        sig.dsOps = (code.match(/\blist\(|\bdict\(|\bset\(|Counter\(|defaultdict\(/g) || []).length;
        sig.functions = (code.match(/\bdef\s+\w+\s*\(/g) || []).length;
        sig.recursion = /def\s+(\w+)\s*\([^)]*\)[\s\S]*?\1\s*\(/.test(code);
        sig.sorting = /sorted\s*\(|\.sort\s*\(/.test(code);
        (code.match(/\b(for|while|if|elif|else|return|break|continue|try|except|def|class|import)\b/g) || []).forEach(k => sig.keywords.add(k));
    }
    return sig;
}

// Compare two logic signatures and return alignment score 0-1
function compareLogicSignatures(ref, user) {
    if (!ref || !user) return 0.5;
    let matchPoints = 0, totalPoints = 0;
    // Compare each dimension with tolerance
    const dims = ['loops', 'conditions', 'assignments', 'prints', 'mathOps', 'stringOps', 'arrayOps', 'dsOps', 'functions'];
    dims.forEach(dim => {
        totalPoints += 2;
        if (ref[dim] === 0 && user[dim] === 0) { matchPoints += 2; }
        else if (ref[dim] > 0 && user[dim] > 0) { matchPoints += 2; }
        else if (ref[dim] === 0 && user[dim] > 0) { matchPoints += 1; }  // Extra work is OK
        // ref > 0 but user = 0 → 0 points (missing expected pattern)
    });
    // Boolean checks
    totalPoints += 2;
    if (ref.recursion === user.recursion) matchPoints += 2;
    else if (user.recursion && !ref.recursion) matchPoints += 1;  // Recursion instead of iteration is OK
    totalPoints += 2;
    if (ref.sorting === user.sorting) matchPoints += 2;
    else if (!ref.sorting && !user.sorting) matchPoints += 2;
    // Keyword overlap
    totalPoints += 4;
    const refKeys = ref.keywords || new Set();
    const userKeys = user.keywords || new Set();
    const commonKeys = [...refKeys].filter(k => userKeys.has(k)).length;
    const keyRatio = refKeys.size > 0 ? commonKeys / refKeys.size : 1;
    matchPoints += Math.round(keyRatio * 4);

    return totalPoints > 0 ? matchPoints / totalPoints : 0.5;
}

// --- Logic & Algorithm Correctness scoring (0-20 pts) ---
function scoreLogicCorrectness(code, language, title, desc) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const isJava = language === 'java';

    // 1. Control flow correctness (0-6 pts)
    const isJS = language === 'javascript';
    const hasLoops = isJava || isJS ? /for\s*\(|while\s*\(/.test(code) : /for\s+\w+\s+in|while\s+/.test(code);
    const hasConds = isJava || isJS ? /if\s*\(/.test(code) : /\bif\s+/.test(code);
    const hasRecursion = /\w+\s*\(\s*\w+\s*[+\-]\s*1\s*\)/.test(code);
    const isNoLoopProblem = /without\s*(loop|for|while)|no\s*(loop|for|while)|without using loop/i.test(title + ' ' + desc);

    if (isNoLoopProblem) {
        if (hasRecursion || (isJava && /IntStream|Stream\.iterate/.test(code)) || (isJS && /\bfunction\s+\w+|=>/.test(code)) || (!isJava && !isJS && /range\s*\(|join\s*\(|map\s*\(/.test(code))) {
            points += 6; strengths.push('Correct approach for no-loop problem');
        } else if (!hasLoops) { points += 4; }
        else { points += 1; issues.push('Problem requires solution without loops'); }
    } else {
        // Detect conversion/utility problems that legitimately don't need loops
        const isConversionProblem = /convert|hashmap\s*to\s*arraylist|arraylist\s*to|map\s*to\s*list/i.test(title + ' ' + desc);
        const usesConversionAPIs = isJava
            ? /new\s+ArrayList\s*<.*>\s*\(.*\.(keySet|values|entrySet)\s*\(\)\s*\)|Collections\.(list|sort)|Arrays\.asList|\.(keySet|values|entrySet)\s*\(/.test(code)
            : isJS ? /Object\.(keys|values|entries)\s*\(/.test(code)
            : /list\s*\(.*\.(keys|values|items)\s*\(\)\s*\)|\.(keys|values|items)\s*\(/.test(code);

        if (hasLoops || hasRecursion) { points += 5; strengths.push('Has iteration/recursion logic'); }
        else if (isConversionProblem && usesConversionAPIs) { points += 5; strengths.push('Uses API-based conversion (loops not required)'); }
        else if (hasConds) { points += 3; }
        else { points += 1; issues.push('Missing control flow logic'); }
        // Bonus for multiple loops when problem likely requires them
        const loopCount = (code.match(isJava || isJS ? /for\s*\(|while\s*\(/g : /for\s+\w+\s+in|while\s+/g) || []).length;
        if (loopCount >= 2) { points += 1; }
    }

    // 2. Semantic correctness checks (0-6 pts)
    let semanticPoints = 0;
    if (isJava) {
        // Check: String comparison with .equals() instead of ==
        const stringCompareWithEquals = /\.equals\s*\(/.test(code);
        const stringCompareWithDoubleEquals = /"\w*"\s*==\s*\w+|\w+\s*==\s*"\w*"/.test(code);
        if (stringCompareWithDoubleEquals && !stringCompareWithEquals) {
            issues.push('Use .equals() for String comparison instead of ==');
        } else { semanticPoints += 1; }

        // Check: Proper loop bounds (no obvious off-by-one)
        const forLoopBounds = code.match(/for\s*\(\s*int\s+\w+\s*=\s*(\d+)\s*;\s*\w+\s*(<|<=|>|>=)\s*[^;]+;/g) || [];
        if (forLoopBounds.length > 0) { semanticPoints += 1; strengths.push('Proper loop bounds'); }

        // Check: Return values in methods are used
        const nonVoidMethods = (code.match(/(?:public|private|static)\s+(?!void)\w+\s+\w+\s*\(/g) || []).length;
        if (nonVoidMethods > 0) { semanticPoints += 1; strengths.push('Methods return computed values'); }
        else { semanticPoints += 1; }

        // Check: Proper array/collection traversal
        if (/for\s*\(\s*\w+\s+\w+\s*:\s*\w+\s*\)/.test(code) || /\.forEach\s*\(/.test(code) || /\.stream\s*\(/.test(code)) {
            semanticPoints += 1; strengths.push('Uses enhanced iteration');
        } else if (/for\s*\(.*\.length|for\s*\(.*\.size/.test(code)) {
            semanticPoints += 1;
        } else { semanticPoints += 0.5; }
    } else if (isJS) {
        // JavaScript semantic checks
        // Check: Uses === instead of ==
        const usesStrictEquality = /===|!==/.test(code);
        const usesLooseEquality = /[^=!]==[^=]|[^!]!=[^=]/.test(code);
        if (usesLooseEquality && !usesStrictEquality) { issues.push('Use === for strict equality instead of =='); }
        else { semanticPoints += 1; }

        // Check: Proper loop bounds
        const forLoopBounds = code.match(/for\s*\(\s*(?:let|var|const)\s+\w+\s*=\s*\d+\s*;/g) || [];
        if (forLoopBounds.length > 0) { semanticPoints += 1; strengths.push('Proper loop bounds'); }

        // Check: Uses const/let instead of var
        if (/\bconst\s|\blet\s/.test(code) && !/\bvar\s/.test(code)) {
            semanticPoints += 1; strengths.push('Uses modern const/let declarations');
        } else if (/\bconst\s|\blet\s/.test(code)) { semanticPoints += 0.5; }

        // Check: Proper array/object methods
        if (/\.forEach\s*\(|\.map\s*\(|\.filter\s*\(|\.reduce\s*\(|for\s*\(.*\bof\b/.test(code)) {
            semanticPoints += 1; strengths.push('Uses modern iteration methods');
        } else if (/for\s*\(.*\.length/.test(code)) { semanticPoints += 1; }
        else { semanticPoints += 0.5; }
    } else {
        // Python semantic checks
        // Check: Proper list/string operations
        if (/\[.*:.*\]|\.append\(|\.extend\(|\.join\(/.test(code)) {
            semanticPoints += 1; strengths.push('Proper use of Python idioms');
        } else { semanticPoints += 0.5; }

        // Check: f-string or format for output
        if (/f["']|\.format\s*\(|%\s*[sd]/.test(code)) {
            semanticPoints += 1;
        } else { semanticPoints += 0.5; }

        // Check: Proper iteration (enumerate, range, items)
        if (/enumerate\s*\(|\.items\s*\(|range\s*\(len/.test(code)) {
            semanticPoints += 1; strengths.push('Pythonic iteration patterns');
        } else if (hasLoops) { semanticPoints += 0.5; }

        // Check: Comprehensions where appropriate
        if (/\[.*for\s+\w+\s+in.*\]|\{.*for\s+\w+\s+in.*\}/.test(code)) {
            semanticPoints += 1; strengths.push('Uses list/dict comprehensions');
        } else { semanticPoints += 0.5; }
    }
    points += Math.min(6, Math.round(semanticPoints));

    // 3. Data handling correctness (0-4 pts)
    const hasVariables = isJava
        ? (code.match(/(int|String|long|double|boolean|char|float|List|Map|Set|var)\s+\w+/g) || []).length >= 2
        : isJS ? (code.match(/(const|let|var)\s+\w+\s*=/g) || []).length >= 2
        : (code.match(/\w+\s*=\s*(?!.*print)/g) || []).length >= 2;
    if (hasVariables) { points += 2; strengths.push('Proper variable usage'); }
    else { points += 1; }

    const hasOutput = isJava ? /System\.out\.print/.test(code) : isJS ? /console\.log\s*\(/.test(code) : /\bprint\s*\(/.test(code);
    if (hasOutput) { points += 2; }
    else { issues.push('No output statement found'); }

    // 4. Operator correctness (0-4 pts)
    const hasCorrectOps = isJava
        ? /[+\-*\/%]|\.equals|\.compareTo|\.contains|\.length/.test(code)
        : isJS ? /[+\-*\/%]|===|!==|\.includes|\.length|\.indexOf/.test(code)
        : /[+\-*\/%]|==|!=|in\s|not\s+in|len\(/.test(code);
    if (hasCorrectOps) { points += 2; strengths.push('Uses appropriate operators'); }
    // Check for common mistakes
    const hasCommonMistakes = [];
    if (isJava) {
        if (/int\s+\w+\s*=\s*\w+\s*\/\s*\w+/.test(code) && !/double|float|\.0/.test(code) && /average|avg|mean/i.test(title)) {
            hasCommonMistakes.push('Integer division may lose precision for average calculation');
        }
    } else {
        if (/\/(?!\/)/.test(code) && !/\/\//.test(code) && /average|avg|mean/i.test(title)) {
            // Python 3 / is float division, so this is actually OK
        }
    }
    if (hasCommonMistakes.length === 0) { points += 2; }
    else { points += 1; issues.push(...hasCommonMistakes); }

    return { points: Math.min(20, points), strengths, issues };
}

// --- Structure scoring (0-10 pts, difficulty-aware) ---
function scoreStructure(code, language, difficulty) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const isSimple = difficulty === 'simple' || difficulty === 'easy';

    if (language === 'java') {
        if (/class\s+\w+/.test(code)) { points += 2; strengths.push('Proper class definition'); }
        else issues.push('Missing class definition');
        if (/public\s+static\s+void\s+main/.test(code)) { points += 2; strengths.push('Correct main method'); }
        else issues.push('Missing or incorrect main method');
        const methodCount = (code.match(/(?:public|private|static)\s+\w+\s+\w+\s*\(/g) || []).length;
        if (methodCount > 1) { points += 3; strengths.push('Modular design with helper methods'); }
        else if (methodCount === 1) { points += 2; strengths.push('Clean single-method solution'); }
        const varDecls = (code.match(/(int|String|long|double|float|boolean|char|List|Map|Set|Array)\s+\w+/g) || []).length;
        if (varDecls >= 3) { points += 3; strengths.push('Proper variable declarations'); }
        else if (varDecls >= 1) { points += isSimple ? 2 : 1; }
    } else if (language === 'javascript') {
        const hasFunctions = /function\s+\w+\s*\(|=>/.test(code);
        if (hasFunctions) { points += 4; strengths.push('Uses functions for modularity'); }
        else { points += isSimple ? 3 : 1; if (!isSimple) issues.push('Consider using functions for modularity'); }
        const varDecls = (code.match(/(const|let|var)\s+\w+\s*=/g) || []).length;
        if (varDecls >= 3) { points += 3; strengths.push('Good variable declarations'); }
        else if (varDecls >= 1) { points += 2; }
        // Check for const/let vs var
        if (/\bconst\s|\blet\s/.test(code) && !/\bvar\s/.test(code)) {
            points += 3; strengths.push('Uses modern const/let declarations');
        } else if (/\bconst\s|\blet\s/.test(code)) { points += 2; }
        else { points += 1; issues.push('Consider using const/let instead of var'); }
    } else if (language === 'python') {
        const hasFunctions = /def\s+\w+\s*\(/.test(code);
        if (hasFunctions) { points += 4; strengths.push('Uses functions for modularity'); }
        else { points += isSimple ? 3 : 1; if (!isSimple) issues.push('Consider using functions for modularity'); }
        const assignments = (code.match(/\w+\s*=\s*(?!.*=\s*$)/g) || []).length;
        if (assignments >= 3) { points += 3; strengths.push('Good use of variables'); }
        else if (assignments >= 1) { points += 2; }
        const indentIssues = code.split('\n').filter(l => l.trim() && /^\s+/.test(l) && l.match(/^\s*/)[0].length % 4 !== 0).length;
        if (indentIssues === 0) { points += 3; } else { points += 1; issues.push('Some indentation inconsistencies'); }
    }

    return { points: Math.min(10, points), strengths, issues };
}

// --- Logic complexity scoring (replaced by scoreLogicCorrectness above) ---
// Kept as alias for backward compatibility
function scoreLogicComplexity(code, language, title) {
    return scoreLogicCorrectness(code, language, title, '');
}

// --- Problem-specific relevance scoring (0-15 pts) ---
function scoreProblemRelevance(code, language, title, desc) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const isJava = language === 'java';

    const problemPatterns = [
        { keywords: ['reverse', 'string', 'without reverse'],
          java: [/charAt|toCharArray|StringBuilder/, /for\s*\(.*length|for\s*\(.*>=\s*0/],
          python: [/\[::-1\]|reversed|for\s+\w+\s+in\s+range\(len/, /join|\.append/],
          javascript: [/\.split\s*\(|\.reverse\s*\(|\.join\s*\(|charAt/, /for\s*\(.*length|for\s*\(.*>=\s*0/] },
        { keywords: ['duplicate', 'remove duplicate'],
          java: [/HashSet|LinkedHashSet|TreeSet|Set<|\.contains\s*\(|\.add\s*\(/, /for|while/],
          python: [/set\s*\(|dict\.fromkeys|\bnot\s+in\b|\.add\(/, /for\s+\w+\s+in/],
          javascript: [/new\s+Set|\.has\s*\(|\.add\s*\(|\.includes\s*\(|Set/, /for|while|\.filter|\.forEach/] },
        { keywords: ['palindrome'],
          java: [/charAt|StringBuilder.*reverse|\.equals/, /for|while/],
          python: [/\[::-1\]|reversed|==.*\[::-1\]/, /for|while|if/],
          javascript: [/\.split\s*\(|\.reverse\s*\(|\.join\s*\(|charAt/, /for|while|if|===|==/] },
        { keywords: ['leap year'],
          java: [/%\s*4|%\s*100|%\s*400/, /if.*&&|if.*\|\|/],
          python: [/%\s*4|%\s*100|%\s*400/, /if.*and|if.*or/],
          javascript: [/%\s*4|%\s*100|%\s*400/, /if.*&&|if.*\|\|/] },
        { keywords: ['armstrong'],
          java: [/%\s*10|Math\.pow|digit/, /while|for/],
          python: [/%\s*10|\*\*|pow\s*\(/, /while|for/],
          javascript: [/%\s*10|Math\.pow|\*\*|digit/, /while|for/] },
        { keywords: ['prime'],
          java: [/%\s*\w+\s*==\s*0|Math\.sqrt/, /for|while/],
          python: [/%\s*\w+\s*==\s*0|sqrt|range\(2/, /for|while/],
          javascript: [/%\s*\w+\s*===?\s*0|Math\.sqrt/, /for|while/] },
        { keywords: ['pangram'],
          java: [/[a-z]|toLowerCase|alphabet|26/, /for|contains|charAt/],
          python: [/[a-z]|lower|alphabet|26|set\(|ascii_lowercase/, /for|all\(|set/],
          javascript: [/[a-z]|toLowerCase|alphabet|26|new\s+Set/, /for|\.every|\.includes/] },
        { keywords: ['fibonacci'],
          java: [/\+.*prev|\w+\s*=\s*\w+\s*\+\s*\w+/, /for|while/],
          python: [/\+.*prev|\w+\s*=\s*\w+\s*\+\s*\w+|\w+,\s*\w+\s*=\s*\w+,/, /for|while|range/],
          javascript: [/\+.*prev|\w+\s*=\s*\w+\s*\+\s*\w+/, /for|while/] },
        { keywords: ['factorial'],
          java: [/\*=|\*\s*\w+/, /for|while|recursion/],
          python: [/\*=|\*\s*\w+|math\.factorial/, /for|while|range|def/],
          javascript: [/\*=|\*\s*\w+/, /for|while|function|=>/] },
        { keywords: ['sort', 'ascending', 'descending'],
          java: [/Arrays\.sort|Collections\.sort|\.sort\(|Comparator/, /\[|\bList\b/],
          python: [/\.sort\s*\(|sorted\s*\(|reverse\s*=/, /\[|\blist\b/],
          javascript: [/\.sort\s*\(|\(a,\s*b\)\s*=>|Comparator/, /\[|Array/] },
        { keywords: ['vowel', 'consonant'],
          java: [/[aeiou]|vowel/, /for|while|charAt|count/],
          python: [/[aeiou]|vowel/, /for|count|in\s/],
          javascript: [/[aeiou]|vowel|\.includes/, /for|\.match|\.replace|\.split/] },
        { keywords: ['swap', 'without third'],
          java: [/\+|-|\^|=.*\+|=.*-|=.*\^/, /=.*=/],
          python: [/,\s*\w+\s*=\s*\w+\s*,|\+|-|\^/, /=/],
          javascript: [/\+|-|\^|=.*\+|=.*-|\[.*\]\s*=\s*\[/, /=/] },
        { keywords: ['frequency', 'count', 'repeated', 'occurrence'],
          java: [/HashMap|Map<|\.put\s*\(|\.get\s*\(|\.getOrDefault\s*\(/, /for|while/],
          python: [/Counter|\{\}|\.get\s*\(|dict|\.count\s*\(|\bfor\b.*in\b/, /for|if/],
          javascript: [/new\s+Map|\{\}|\[.*\]|Map|\.has\s*\(|\.get\s*\(/, /for|forEach|\.reduce/] },
        { keywords: ['median'],
          java: [/Arrays\.sort|\.sort|length\s*\/\s*2|\.length/, /sort|\//],
          python: [/sorted|\.sort|len.*\/\/\s*2|len\(/, /sort|\//],
          javascript: [/\.sort\s*\(|Math\.floor|\.length\s*\/\s*2/, /sort|\//] },
        { keywords: ['second largest', 'second smallest'],
          java: [/sort|max|min|Integer\.MIN|Integer\.MAX|\[\s*\w+\s*-\s*2\s*\]/, /for|if|sort/],
          python: [/sorted|max|min|float\('inf'\)|\[-2\]|\.sort/, /for|if|sort/],
          javascript: [/\.sort\s*\(|Math\.max|Math\.min|Infinity|\[.*-\s*2\]/, /for|if|sort/] },
        { keywords: ['zero', 'move zero', 'zeros to end'],
          java: [/==\s*0|!=\s*0|\[\s*\w+\s*\]/, /for|while/],
          python: [/==\s*0|!=\s*0|\.append|\.remove/, /for|while/],
          javascript: [/===?\s*0|!==?\s*0|\.push|\.splice|\.filter/, /for|while/] },
        { keywords: ['pyramid', 'pattern', 'star'],
          java: [/\*|star|print/, /for\s*\(.*for\s*\(/],
          python: [/\*|star|print/, /for.*for|range.*range/],
          javascript: [/\*|star|console\.log|\.repeat\s*\(/, /for\s*\(.*for\s*\(/] },
        { keywords: ['word', 'sentence', 'reverse word'],
          java: [/\.split\s*\(|join|StringBuilder|StringJoiner/, /for|while/],
          python: [/\.split\s*\(|\.join\s*\(|reversed/, /for|while|\[::-1\]/],
          javascript: [/\.split\s*\(|\.join\s*\(|\.reverse\s*\(/, /for|\.map|\.forEach/] },
        { keywords: ['uppercase', '2nd character', 'second character', 'capitalize'],
          java: [/charAt|toUpperCase|substring|Character\.toUpperCase/, /for|split/],
          python: [/upper|capitalize|\[\d+\]|\.title/, /for|split|join/],
          javascript: [/\.toUpperCase\s*\(|\.charAt|\.split|\.substring/, /for|\.map|\.join/] },
        { keywords: ['map', 'hashmap', 'average', 'values'],
          java: [/HashMap|Map|\.values\(\)|\.entrySet\(\)|\.keySet\(\)/, /for|stream|sum|average/],
          python: [/dict|\.values\(\)|\.items\(\)|\.keys\(\)|sum\(/, /for|len\(|sum/],
          javascript: [/new\s+Map|Object\.(keys|values|entries)|\{\}|\.get\s*\(/, /for|\.reduce|\.forEach/] },
        { keywords: ['replace', 'word', 'manipulation'],
          java: [/\.replace\s*\(|\.replaceAll\s*\(|\.replaceFirst\s*\(/, /String/],
          python: [/\.replace\s*\(|re\.sub/, /str|string/],
          javascript: [/\.replace\s*\(|\.replaceAll\s*\(|new\s+RegExp/, /String|string/] },
        { keywords: ['power', 'pow', 'exponent'],
          java: [/Math\.pow|\*.*\*|for.*\*=/, /for|while|Math/],
          python: [/\*\*|pow\s*\(|for.*\*=/, /for|while|def/],
          javascript: [/Math\.pow|\*\*|for.*\*=/, /for|while|function|=>/] },
        { keywords: ['compress', 'expand', 'compressed string'],
          java: [/charAt|Character\.isDigit|StringBuilder/, /for|while/],
          python: [/isdigit|\.isdigit\(\)|int\(/, /for|while/],
          javascript: [/charAt|isNaN|parseInt|\[\d+\]/, /for|while/] },
        { keywords: ['thread', 'multi-thread', 'concurrent'],
          java: [/Thread|Runnable|ExecutorService|synchronized|Callable|extends\s+Thread|implements\s+Runnable/, /start\(\)|run\(\)|execute/],
          python: [/threading|Thread|concurrent|multiprocessing/, /start\(\)|run\(\)|join/],
          javascript: [/Promise|async|await|setTimeout|Worker|new\s+Promise/, /then\(\)|catch\(\)|async|await/] },
        { keywords: ['non-repeating', 'first non-repeating', 'unique'],
          java: [/LinkedHashMap|HashMap|Map|\.put|\.get|\.charAt/, /for|while/],
          python: [/Counter|dict|OrderedDict|\.count\(|\.get\(/, /for|if/],
          javascript: [/new\s+Map|\{\}|\.indexOf|\.lastIndexOf|\.charAt/, /for|\.find|\.filter/] },
        { keywords: ['filter', 'substring', 'containing'],
          java: [/\.contains\s*\(|\.filter\s*\(|stream/, /for|if|List/],
          python: [/\bin\b|\bif\b.*\bin\b|\.find\s*\(|filter\s*\(/, /for|if|list/],
          javascript: [/\.includes\s*\(|\.filter\s*\(|\.indexOf\s*\(/, /for|if|\.map|\.filter/] },
        { keywords: ['digit', 'count digit', 'number of digits'],
          java: [/%\s*10|\/\s*10|String\.valueOf|\.length\(\)/, /while|for/],
          python: [/%\s*10|\/\/\s*10|str\(|len\(/, /while|for/],
          javascript: [/%\s*10|Math\.floor|\.toString\(\)|\.length/, /while|for/] },
        { keywords: ['double each', 'duplicate character', 'repeat char'],
          java: [/charAt|StringBuilder|\.append\s*\(|toCharArray/, /for/],
          python: [/for.*in\s|join|\*\s*2|\+/, /for/],
          javascript: [/\.split\s*\(|\.map\s*\(|\.join\s*\(|\.repeat\s*\(/, /for|\.map/] },
        { keywords: ['remove number', 'remove digit'],
          java: [/replaceAll\s*\(.*\\d|Character\.isDigit|isDigit/, /for|replaceAll/],
          python: [/isdigit|re\.sub|isalpha|\bnot\b.*isdigit/, /for|join|re/],
          javascript: [/\.replace\s*\(.*\\d|isNaN|parseInt/, /for|\.replace|\.match/] },
        { keywords: ['space', 'leading', 'trailing', 'trim', 'non-space'],
          java: [/\.trim\s*\(|\.strip\s*\(|\.replaceAll\s*\(.*\\s|\.replace\s*\(\s*"\\s/, /String/],
          python: [/\.strip\s*\(|\.replace\s*\(|\.lstrip|\.rstrip|re\.sub/, /str|for/],
          javascript: [/\.trim\s*\(|\.trimStart|\.trimEnd|\.replace\s*\(.*\\s/, /String|string/] },
        { keywords: ['merge', 'two array', 'sorted', 'no duplicate'],
          java: [/HashSet|TreeSet|Set|Arrays\.sort|\.addAll|\.add/, /for|sort/],
          python: [/set\s*\(|sorted\s*\(|\+|\.extend|\.union/, /sort|set/],
          javascript: [/new\s+Set|\.\.\.|concat|\.sort\s*\(|\.push/, /for|sort|\.filter/] },
        { keywords: ['sort by length', 'sort word'],
          java: [/Comparator|\.length\(\)|Collections\.sort|\.sort\(/, /for|sort|compare/],
          python: [/sorted\s*\(.*key\s*=|\.sort\s*\(.*key\s*=|len/, /sort|lambda|key/],
          javascript: [/\.sort\s*\(|\.length|\(a,\s*b\)\s*=>/, /sort|=>/] },
        { keywords: ['arraylist', 'convert', 'hashmap to'],
          java: [/new\s+ArrayList|\.entrySet|\.keySet|\.values/, /HashMap|Map|List/, /\.put\s*\(|map\.key|map\.value|System\.out\.print/],
          python: [/list\s*\(|\.items\(\)|\.keys\(\)|\.values\(\)/, /dict|list/, /print\s*\(/],
          javascript: [/Object\.(keys|values|entries)|Array\.from|new\s+Map|\.entries\(\)/, /Map|Object|Array/, /console\.log/] },
        { keywords: ['without loop', '1 to 100', 'without for', 'without while', 'recursion'],
          java: [/void\s+\w+\s*\(\s*int|static\s+\w+\s+\w+\s*\(\s*int|IntStream|Stream\.iterate/],
          python: [/def\s+\w+\s*\(\s*\w+|range\s*\(|recursion|sys\.setrecursionlimit|join|map/],
          javascript: [/function\s+\w+\s*\(|=>|Array\.from|\.\.\.\.Array/] },
        { keywords: ['same element', 'check array', 'arrays have same'],
          java: [/Arrays\.sort|HashSet|containsAll|\.contains/, /for|sort/],
          python: [/sorted\s*\(|set\s*\(|==|Counter/, /sort|set/],
          javascript: [/\.sort\s*\(|new\s+Set|\.every\s*\(|\.includes/, /sort|Set/] },
        { keywords: ['sort hashmap', 'sort map', 'sort by value'],
          java: [/entrySet|Map\.Entry|Comparator|\.getValue|Collections\.sort|stream.*sorted/, /for|sort|compare/],
          python: [/sorted\s*\(.*\.items\(\)|lambda|\.items\(\)|key\s*=/, /sort|lambda|dict/],
          javascript: [/Object\.entries|\.sort\s*\(|\(a,\s*b\)\s*=>|new\s+Map/, /sort|=>/] },
        { keywords: ['reverse position', 'reverse at position'],
          java: [/\.split\s*\(|StringBuilder|\.reverse\(\)|String\.join/, /for|split/],
          python: [/\.split\s*\(|\.join\s*\(|\[::-1\]|reversed/, /for|split/],
          javascript: [/\.split\s*\(|\.reverse\s*\(|\.join\s*\(|\.slice\s*\(/, /for|split/] },
    ];

    let matchedProblem = false;
    let bestPatternScore = 0;
    let bestTotalPatterns = 0;
    let bestMatchCount = 0;

    // Check ALL matching problem patterns (not just the first one)
    for (const pattern of problemPatterns) {
        const keywordMatch = pattern.keywords.some(kw => title.includes(kw) || desc.includes(kw));
        if (!keywordMatch) continue;
        matchedProblem = true;

        const langPatterns = isJava ? pattern.java : language === 'javascript' ? (pattern.javascript || pattern.java) : pattern.python;
        let patternMatchCount = 0;
        for (const regex of langPatterns) {
            if (regex.test(code)) patternMatchCount++;
        }
        const thisScore = langPatterns.length > 0 ? patternMatchCount / langPatterns.length : 0;
        if (thisScore > bestPatternScore) {
            bestPatternScore = thisScore;
            bestTotalPatterns = langPatterns.length;
            bestMatchCount = patternMatchCount;
        }
    }

    if (matchedProblem) {
        if (bestPatternScore >= 1.0) {
            points = 15;
            strengths.push('Code matches expected approach for this problem');
        } else if (bestPatternScore > 0) {
            points = Math.round(7 + bestPatternScore * 8);
            strengths.push('Partially matches expected approach');
        } else {
            points = 3;
            issues.push('Code approach may not match the problem requirements');
        }
    } else {
        // Fallback: generic logic assessment
        const hasLogic = /for|while|if/.test(code);
        const hasDS = isJava ? /ArrayList|HashMap|HashSet|Map|List|Set/.test(code) : language === 'javascript' ? /Map|Set|Object|Array|\.push|\.pop|\.shift/.test(code) : /list|dict|set|Counter/.test(code);
        points = 5 + (hasLogic ? 4 : 0) + (hasDS ? 3 : 0);
        points = Math.min(12, points);
        if (hasLogic) strengths.push('Contains algorithmic logic');
    }

    return { points: Math.min(15, points), strengths, issues };
}

// --- Code Quality & Style scoring (0-10 pts) ---
function scoreCodeQuality(code, language, codeLines, difficulty) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const isJava = language === 'java';
    const isSimple = (difficulty || '').toLowerCase() === 'simple' || (difficulty || '').toLowerCase() === 'easy';

    // 1. Naming conventions (0-3 pts)
    const varNames = isJava
        ? (code.match(/(?:int|String|long|double|boolean|char|List|Map|Set|var)\s+(\w+)/g) || [])
        : language === 'javascript'
        ? (code.match(/(?:const|let|var)\s+(\w+)/g) || [])
        : (code.match(/^(\w+)\s*=/gm) || []);
    const names = varNames.map(v => v.replace(/.*\s+/, '').replace(/\s*=.*/, '').trim()).filter(n => n.length > 0);

    let namingScore = 0;
    const meaningfulNames = names.filter(n => n.length > 2 && !/^(i|j|k|n|m|x|y|a|b|c|s|t|_)$/i.test(n));
    if (meaningfulNames.length >= 2) namingScore += 1;

    // camelCase check for Java, snake_case check for Python
    if (isJava) {
        const camelCaseNames = names.filter(n => n.length > 2 && /^[a-z][a-zA-Z0-9]*$/.test(n));
        if (camelCaseNames.length >= 2) { namingScore += 1; }
        const classNameCheck = (code.match(/class\s+([A-Z]\w*)/g) || []).length > 0;
        if (classNameCheck) { namingScore += 1; }
    } else if (language === 'javascript') {
        const camelCaseNames = names.filter(n => n.length > 2 && /^[a-z][a-zA-Z0-9]*$/.test(n));
        if (camelCaseNames.length >= 2) { namingScore += 1; }
        // JS: prefer const/let over var
        if (/\bconst\s|\blet\s/.test(code) && !/\bvar\s/.test(code)) { namingScore += 1; }
        else { namingScore += 0.5; }
    } else {
        const snakeCaseNames = names.filter(n => n.length > 2 && /^[a-z][a-z0-9_]*$/.test(n));
        if (snakeCaseNames.length >= 1) { namingScore += 1; }
        // Python: no all-caps non-constants
        namingScore += 1;
    }
    points += Math.min(3, namingScore);
    if (namingScore >= 2) strengths.push('Good naming conventions');

    // 2. Code length appropriateness (0-2 pts)
    const effectiveLines = codeLines.length;
    if (effectiveLines >= 5 && effectiveLines <= 100) { points += 2; }
    else if (effectiveLines >= 3) { points += 1; }
    else { issues.push('Very short code — may be incomplete'); }

    // 3. Readability & formatting (0-2 pts)
    let readabilityPts = 0;
    // Check for consistent indentation
    if (isJava) {
        const braceBalance = (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length;
        if (braceBalance) readabilityPts += 1;
    } else if (language === 'javascript') {
        const braceBalance = (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length;
        if (braceBalance) readabilityPts += 1;
    } else {
        const indentIssues = code.split('\n').filter(l => l.trim() && /^\s+/.test(l) && l.match(/^\s*/)[0].length % 4 !== 0).length;
        if (indentIssues === 0) readabilityPts += 1;
    }
    // Check for no extremely long lines (>120 chars)
    const longLines = code.split('\n').filter(l => l.length > 120).length;
    if (longLines === 0) readabilityPts += 1;
    else issues.push('Some lines exceed 120 characters');
    points += readabilityPts;

    // 4. No dangerous/unnecessary APIs (0-1 pt)
    if (!/Thread\.sleep|System\.exit|Runtime\.getRuntime|ProcessBuilder|exec\s*\(|child_process|\beval\s*\(/.test(code)) { points += 1; }
    else { issues.push('Uses potentially dangerous APIs'); }

    // 5. Dead code detection (0-2 pts)
    let deadCodePts = 2;
    // Check for unused imports (Java)
    if (isJava) {
        const imports = code.match(/import\s+([\w.*]+);/g) || [];
        for (const imp of imports) {
            const className = imp.replace(/import\s+/, '').replace(/;/, '').split('.').pop().replace('*', '');
            if (className && className !== '*' && !code.replace(imp, '').includes(className)) {
                deadCodePts -= 1; issues.push(`Unused import: ${className}`);
                break;
            }
        }
    }
    if (language === 'javascript') {
        // Check for unused require/import
        const requireStatements = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(/g) || [];
        for (const req of requireStatements) {
            const varName = req.match(/(?:const|let|var)\s+(\w+)/)?.[1];
            if (varName && code.split(varName).length <= 2) {
                deadCodePts -= 1; issues.push(`Possibly unused require: ${varName}`);
                break;
            }
        }
    }
    // Check for code after return (all languages)
    if (isJava && /return\s+[^;]+;\s*\n\s*[^}\s]/m.test(code)) {
        deadCodePts -= 1; issues.push('Unreachable code after return statement');
    }
    if (!isJava && language !== 'javascript' && /\breturn\b.*\n\s+\S/.test(code) && !/\breturn\b.*\n\s+(elif|else|except|finally)/.test(code)) {
        // More careful check for Python — only flag if next line isn't a clause
        const returnLines = code.split('\n');
        for (let i = 0; i < returnLines.length - 1; i++) {
            if (/^\s+return\b/.test(returnLines[i]) && returnLines[i + 1].trim() && !/^\s*(elif|else|except|finally|def|class|#)/.test(returnLines[i + 1])) {
                deadCodePts -= 1; issues.push('Possible unreachable code after return');
                break;
            }
        }
    }
    points += Math.max(0, deadCodePts);

    return { points: Math.min(10, points), strengths, issues };
}

// --- Edge Cases & Robustness scoring (0-10 pts) ---
function scoreEdgeCases(code, language, title, difficulty) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const isJava = language === 'java';
    const isSimple = (difficulty || '').toLowerCase() === 'simple' || (difficulty || '').toLowerCase() === 'easy';

    // 1. Null/empty guards (0-3 pts)
    let guardPts = 0;
    if (isJava) {
        // Check for actual null guards (null check before usage, not just mentioning null)
        const hasNullCheck = /\w+\s*!=\s*null|null\s*!=\s*\w+|Objects\.requireNonNull|Optional/.test(code);
        const hasEmptyCheck = /\.isEmpty\s*\(|\.length\s*(?:==|>|<|!=)\s*\d|\.size\s*\(\)\s*(?:==|>|<|!=)\s*\d/.test(code);
        if (hasNullCheck) { guardPts += 2; strengths.push('Null safety checks'); }
        if (hasEmptyCheck) { guardPts += 1; strengths.push('Empty collection/string checks'); }
    } else if (language === 'javascript') {
        const hasNullCheck = /!==?\s*null|!==?\s*undefined|typeof\s+\w+\s*!==?|\?\.|\?\?/.test(code);
        const hasEmptyCheck = /\.length\s*(?:===?|>|<|!==?)\s*\d|Array\.isArray/.test(code);
        if (hasNullCheck) { guardPts += 2; strengths.push('Null/undefined safety checks'); }
        if (hasEmptyCheck) { guardPts += 1; strengths.push('Empty value checks'); }
    } else {
        const hasNoneCheck = /is\s+None|is\s+not\s+None|\bis\s+None\b|!=\s*None/.test(code);
        const hasEmptyCheck = /not\s+\w+|len\s*\(\s*\w+\s*\)\s*(?:==|>|<|!=)\s*\d|if\s+\w+\s*:/.test(code);
        if (hasNoneCheck) { guardPts += 2; strengths.push('None safety checks'); }
        if (hasEmptyCheck) { guardPts += 1; }
    }
    // For simple/moderate problems with fixed inputs, give partial credit even without guards
    if (guardPts === 0 && isSimple) guardPts = 2;
    else if (guardPts === 0) guardPts = 2; // Assessment problems have fixed inputs — guards are optional
    points += Math.min(3, guardPts);

    // 2. Error handling (0-3 pts)
    let errorPts = 0;
    if (isJava) {
        const hasTryCatch = /try\s*\{[\s\S]*?\}\s*catch\s*\(/.test(code);
        const hasNonEmptyCatch = /catch\s*\([^)]+\)\s*\{[^}]+\}/.test(code);  // Non-empty catch block
        if (hasTryCatch && hasNonEmptyCatch) { errorPts += 3; strengths.push('Proper error handling with try-catch'); }
        else if (hasTryCatch) { errorPts += 1; issues.push('Empty catch block — errors are silently swallowed'); }
    } else if (language === 'javascript') {
        const hasTryCatch = /try\s*\{[\s\S]*?\}\s*catch\s*\(/.test(code);
        const hasNonEmptyCatch = /catch\s*\([^)]+\)\s*\{[^}]+\}/.test(code);
        if (hasTryCatch && hasNonEmptyCatch) { errorPts += 3; strengths.push('Proper error handling with try-catch'); }
        else if (hasTryCatch) { errorPts += 1; issues.push('Empty catch block — errors are silently swallowed'); }
    } else {
        const hasTryExcept = /try\s*:[\s\S]*?except/.test(code);
        const hasSpecificExcept = /except\s+\w+/.test(code);  // Not bare except
        if (hasTryExcept && hasSpecificExcept) { errorPts += 3; strengths.push('Proper error handling with specific exceptions'); }
        else if (hasTryExcept) { errorPts += 2; if (/except\s*:/.test(code)) issues.push('Bare except — catch specific exceptions'); }
    }
    // For simple/moderate fixed-input problems, give partial credit
    // Assessment problems have fixed inputs — try-catch is unnecessary overhead
    if (errorPts === 0 && isSimple) errorPts = 2;
    else if (errorPts === 0) errorPts = 2; // Fixed-input problems don't need error handling
    points += Math.min(3, errorPts);

    // 3. Boundary awareness (0-2 pts)
    let boundaryPts = 0;
    // Check for boundary-related patterns specific to the problem
    if (/array|list|arr\b/i.test(title)) {
        if (/\.length|len\s*\(|\.size\s*\(/.test(code)) { boundaryPts += 1; }
        if (/\[\s*0\s*\]|\[\s*\w+\s*-\s*1\s*\]|first|last/.test(code)) { boundaryPts += 1; strengths.push('Array boundary awareness'); }
    } else if (/string|word|sentence/i.test(title)) {
        if (/\.length|len\s*\(|\.charAt|\.substring|\[\s*\d+\s*\]/.test(code)) { boundaryPts += 2; }
    } else {
        // Generic boundary check
        if (/==\s*0|<=\s*0|>=\s*\d|!=\s*0/.test(code)) { boundaryPts += 1; }
        boundaryPts += 1;  // Not applicable for this problem type
    }
    points += Math.min(2, boundaryPts);

    // 4. Type safety (0-2 pts)
    let typeSafePts = 0;
    if (isJava) {
        // String comparison: .equals() instead of ==
        const usesStringEquals = /\.equals\s*\(|\.equalsIgnoreCase\s*\(/.test(code);
        const usesStringDoubleEquals = /"\w*"\s*==\s*\w+|\w+\s*==\s*"\w*"/.test(code);
        if (usesStringDoubleEquals && !usesStringEquals) { issues.push('Use .equals() for String comparison, not =='); }
        else { typeSafePts += 1; }
        // Proper casting
        if (/\(\s*(int|long|double|float|char)\s*\)/.test(code) || !/ClassCastException/.test(code)) { typeSafePts += 1; }
    } else if (language === 'javascript') {
        // Strict equality check
        const usesStrictEq = /===|!==/.test(code);
        const usesLooseEq = /[^=!]==[^=]|[^!]!=[^=]/.test(code);
        if (usesLooseEq && !usesStrictEq) { issues.push('Use === for strict type-safe comparison'); }
        else { typeSafePts += 1; }
        // Type checks
        if (/typeof|instanceof|Number\.isFinite|Number\.isNaN|Array\.isArray/.test(code)) {
            typeSafePts += 1; strengths.push('Type-safe checks');
        } else { typeSafePts += 1; }
    } else {
        // Python: type conversions
        if (/int\s*\(|float\s*\(|str\s*\(/.test(code)) { typeSafePts += 1; strengths.push('Explicit type conversions'); }
        else { typeSafePts += 1; }
        typeSafePts += 1;
    }
    points += Math.min(2, typeSafePts);

    return { points: Math.min(10, points), strengths, issues };
}

// --- Efficiency & Complexity scoring (0-10 pts) ---
function scoreEfficiency(code, language, title) {
    let points = 0;
    const strengths = [];
    const issues = [];
    const isJava = language === 'java';

    // 1. Time complexity assessment (0-4 pts)
    // Count nested loop depth
    let maxNestDepth = 0;
    if (isJava || language === 'javascript') {
        const codeLines = code.split('\n');
        let currentDepth = 0;
        for (const line of codeLines) {
            if (/for\s*\(|while\s*\(/.test(line)) { currentDepth++; maxNestDepth = Math.max(maxNestDepth, currentDepth); }
            // Simple brace tracking for depth
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            if (closes > opens) currentDepth = Math.max(0, currentDepth - 1);
        }
    } else {
        const codeLines = code.split('\n');
        let indentLevels = [];
        for (const line of codeLines) {
            if (/for\s+\w+\s+in|while\s+/.test(line)) {
                const indent = (line.match(/^\s*/)[0] || '').length;
                indentLevels.push(indent);
            }
        }
        if (indentLevels.length >= 2) {
            // Check if loops are nested (increasing indent)
            for (let i = 1; i < indentLevels.length; i++) {
                if (indentLevels[i] > indentLevels[i - 1]) maxNestDepth = 2;
            }
        }
        if (indentLevels.length >= 3) {
            const sorted = [...new Set(indentLevels)].sort((a, b) => a - b);
            if (sorted.length >= 3) maxNestDepth = 3;
        }
    }

    if (maxNestDepth <= 1) { points += 4; strengths.push('Efficient time complexity'); }
    else if (maxNestDepth === 2) {
        // Check if nested loops are expected for this problem
        const needsNested = /pattern|pyramid|star|matrix|2d|grid|sort.*bubble|selection sort/i.test(title);
        if (needsNested) { points += 4; strengths.push('Appropriate nested loops for this problem'); }
        else { points += 3; }
    }
    else if (maxNestDepth >= 3) { points += 1; issues.push('Triple-nested loops — O(n³) complexity may be too high'); }

    // 2. Space complexity & anti-patterns (0-3 pts)
    let spacePts = 3;

    // Anti-pattern: String concatenation in loops (Java)
    if (isJava && /for\s*\(/.test(code)) {
        if (/\+\s*=.*String|\w+\s*=\s*\w+\s*\+\s*"/.test(code) && !/StringBuilder|StringBuffer|StringJoiner/.test(code)) {
            spacePts -= 1; issues.push('String concatenation in loop — use StringBuilder');
        }
    }

    // Anti-pattern: ArrayList.contains() in loop (should use HashSet)
    if (isJava && /for\s*\(/.test(code) && /ArrayList/.test(code) && /\.contains\s*\(/.test(code)) {
        if (!/HashSet|Set</.test(code)) {
            spacePts -= 1; issues.push('ArrayList.contains() in loop is O(n) — consider HashSet for O(1) lookup');
        }
    }

    // Anti-pattern: Array.includes() in loop (JS — consider Set for O(1) lookup)
    // Skip if .includes() is only used on string literals (e.g. "aeiou".includes(c)) which are O(1) in practice
    if (language === 'javascript' && /for\s*\(/.test(code) && /\.includes\s*\(/.test(code)) {
        const hasArrayIncludes = /\b\w+\.includes\s*\(/.test(code) && !/"[^"]*"\.includes|'[^']*'\.includes/.test(code);
        if (hasArrayIncludes && !/new\s+Set|Set\(/.test(code)) {
            spacePts -= 1; issues.push('Array.includes() in loop is O(n) — consider Set for O(1) lookup');
        }
    }

    // Anti-pattern: list.remove(0) in loop (Python — O(n²))
    if (!isJava && language !== 'javascript' && /for\s+/.test(code) && /\.remove\s*\(\s*0\s*\)/.test(code)) {
        spacePts -= 1; issues.push('list.remove(0) in loop is O(n²) — use collections.deque');
    }

    // Anti-pattern: Unnecessary object creation in loop
    if (isJava && /for\s*\(/.test(code) && /new\s+(String|Integer|Boolean)\s*\(/.test(code)) {
        spacePts -= 1; issues.push('Unnecessary object creation in loop');
    }

    points += Math.max(0, spacePts);
    if (spacePts >= 3) strengths.push('Good space efficiency');

    // 3. Algorithm choice (0-3 pts)
    let algoPts = 0;

    // Check for use of appropriate built-in operations instead of manual implementation
    if (/sort/i.test(title)) {
        if (isJava && /Arrays\.sort|Collections\.sort|\.sort\(|\.stream\(\)\.sorted/.test(code)) { algoPts += 2; strengths.push('Uses built-in sort'); }
        else if (!isJava && /sorted\s*\(|\.sort\s*\(/.test(code)) { algoPts += 2; strengths.push('Uses built-in sort'); }
        else { algoPts += 1; }
    } else if (/duplicate|unique|distinct/i.test(title)) {
        if (isJava && /HashSet|Set<|\.stream\(\)\.distinct/.test(code)) { algoPts += 2; strengths.push('Uses Set for deduplication — O(n)'); }
        else if (!isJava && /set\s*\(|dict\.fromkeys/.test(code)) { algoPts += 2; strengths.push('Uses set for deduplication — O(n)'); }
        else { algoPts += 1; }
    } else if (/frequency|count|occurrence/i.test(title)) {
        if (isJava && /HashMap|getOrDefault|Map</.test(code)) { algoPts += 2; strengths.push('Uses HashMap for frequency counting'); }
        else if (!isJava && /Counter|defaultdict|\.get\s*\(/.test(code)) { algoPts += 2; strengths.push('Uses Counter/dict for frequency counting'); }
        else { algoPts += 1; }
    } else {
        // Generic: code uses reasonable approach
        algoPts += 2;
    }

    // Resource management (Java: Scanner closed, try-with-resources)
    if (isJava && /Scanner/.test(code)) {
        if (/\.close\s*\(\)|try\s*\(.*Scanner/.test(code)) { algoPts += 1; strengths.push('Proper resource management'); }
        else { issues.push('Scanner not closed — consider try-with-resources'); }
    } else {
        algoPts += 1;
    }

    points += Math.min(3, algoPts);

    return { points: Math.min(10, points), strengths, issues };
}

// ==================== MISCELLANEOUS HELPERS ====================
function getAppVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
        return pkg.version;
    } catch {
        return '1.0.0';
    }
}

function detectRuntimeStatus() {
    const checkCommand = (cmd) => {
        try {
            require('child_process').execSync(cmd, {
                stdio: 'ignore',
                shell: true,
                timeout: 5000
            });
            return true;
        } catch {
            return false;
        }
    };

    const javaOk = checkCommand(`"${JAVA_CMD}" -version`);
    const pythonOk = checkCommand(`"${PYTHON_CMD}" --version`);

    return {
        java: javaOk,
        python: pythonOk,
        javaPath: JAVA_CMD,
        javacPath: JAVAC_CMD,
        pythonPath: PYTHON_CMD,
        javaLocal: !!resolvePortableRuntime('java'),
        pythonLocal: !!resolvePortableRuntime('python')
    };
}

// ==================== QUESTION SHUFFLING ====================
function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getQuestionsByExperience(allQuestions, yearsOfExperience) {
    const tier = EXPERIENCE_TIERS.find(t => yearsOfExperience <= t.maxYears) || EXPERIENCE_TIERS[EXPERIENCE_TIERS.length - 1];
    const selected = [];
    const usedIds = new Set();

    const difficulties = ['moderate', 'complex'];
    for (const difficulty of difficulties) {
        const count = tier.questions[difficulty] || 0;
        const filtered = allQuestions.filter(q =>
            q.difficulty && q.difficulty.toLowerCase() === difficulty.toLowerCase() && !usedIds.has(q.id)
        );
        const shuffled = shuffleArray(filtered);
        const toAdd = shuffled.slice(0, count);
        selected.push(...toAdd);
        toAdd.forEach(q => usedIds.add(q.id));
    }

    if (selected.length === 0) {
        return shuffleArray(allQuestions).slice(0, 2);
    }

    return selected;
}

// ==================== WARMUP OLLAMA ====================
async function warmupOllama() {
    if (!USE_OLLAMA) return;

    console.log(`\u{1F504} Warming up Ollama model (${OLLAMA_MODEL})...`);
    const warmupBody = JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false
    });
    const warmupUrl = new URL(OLLAMA_BASE_URL + '/api/chat');

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            req.destroy();
            console.log('\u26A0 Ollama warmup timed out — first agent call may be slow');
            resolve();
        }, 120000);

        const req = http.request({
            hostname: warmupUrl.hostname,
            port: warmupUrl.port,
            path: warmupUrl.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (warmRes) => {
            let d = '';
            warmRes.on('data', c => d += c);
            warmRes.on('end', () => {
                clearTimeout(timeout);
                console.log(`\u2713 Ollama model (${OLLAMA_MODEL}) is warmed up and ready!`);
                resolve();
            });
        });

        req.on('error', (e) => {
            clearTimeout(timeout);
            console.log(`\u26A0 Ollama warm-up failed: ${e.message}. First agent call may be slow.`);
            resolve();
        });

        req.write(warmupBody);
        req.end();
    });
}

// ==================== HTTP SERVER ====================
const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Serve static files from /results/
    if (pathname.startsWith('/results/')) {
        const safePath = path.normalize(pathname.replace('/results/', '')).replace(/^([.][.][\/]+)+/, '');
        const filePath = path.join(__dirname, '../results/', safePath);
        const resultsRoot = path.resolve(path.join(__dirname, '../results'));
        if (!path.resolve(filePath).startsWith(resultsRoot)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.csv': 'text/csv', '.json': 'application/json', '.html': 'text/html', '.txt': 'text/plain'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(fs.readFileSync(filePath));
            return;
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
    }

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-cache');

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const query = Object.fromEntries(parsedUrl.searchParams);

    // ========== STATIC FILE SERVING ==========
    if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8'));
        return;
    }

    if (pathname.startsWith('/public/')) {
        const safePath = path.normalize(pathname.replace('/public/', '')).replace(/^(\.\.(\\|\/|$))+/, '');
        const filePath = path.join(__dirname, '../public/', safePath);
        const publicRoot = path.resolve(path.join(__dirname, '../public'));
        if (!path.resolve(filePath).startsWith(publicRoot)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
                '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(fs.readFileSync(filePath));
            return;
        }
    }

    // ========== API ROUTES ==========

    // --- Send OTP ---
    if (pathname === '/api/auth/send-otp' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { email } = JSON.parse(body);
                if (!isValidEmail(email)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email' }));
                    return;
                }

                // --- Panelist emails bypass candidate checks ---
                const isPanelist = isPanelistEmailServer(email);

                if (!isPanelist) {
                    // Check if candidate email is authorized (CSV whitelist)
                    if (!isCandidateAuthorized(email)) {
                        console.log(`✗ Unauthorized candidate email blocked: ${email}`);
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'You are not authorized to access this page' }));
                        return;
                    }

                    // Check if candidate has already logged in before
                    if (hasCandidateAlreadyLoggedIn(email)) {
                        console.log(`✗ Duplicate login attempt blocked: ${email}`);
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'You are not authorized to access this page for 2nd time' }));
                        return;
                    }
                }

                if (!checkOTPRateLimit(email)) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
                    return;
                }

                const otp = generateOTP();
                otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });

                const sent = await sendOTPEmail(email, otp);

                if (!sent) {
                    console.log(`[Console Fallback] OTP for ${email}: ${otp}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'OTP sent' }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Server error' }));
            }
        });
        return;
    }

    // --- Verify OTP ---
    if (pathname === '/api/auth/verify-otp' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { email, otp } = JSON.parse(body);
                const stored = otpStore.get(email);

                if (!stored || Date.now() > stored.expiresAt) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'OTP expired' }));
                    return;
                }

                if (stored.attempts >= 3) {
                    otpStore.delete(email);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Max attempts exceeded' }));
                    return;
                }

                if (stored.otp !== otp) {
                    stored.attempts++;
                    otpStore.set(email, stored);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid OTP' }));
                    return;
                }

                const token = generateSessionToken();
                sessionStore.set(token, { email, createdAt: Date.now() });
                otpStore.delete(email);

                // Mark candidate as logged in (panelists are excluded)
                const isPanelistUser = isPanelistEmailServer(email);
                if (!isPanelistUser) {
                    markCandidateLoggedIn(email);
                    console.log(`✓ Candidate marked as logged in: ${email}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token, email }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Server error' }));
            }
        });
        return;
    }

    // --- Version ---
    if (pathname === '/api/version' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: 'Code Evaluator AI Agent',
            version: getAppVersion(),
            timestamp: getISTTimestamp()
        }));
        return;
    }

    // --- Runtime Health ---
    if (pathname === '/api/health/runtime' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(detectRuntimeStatus()));
        return;
    }

    // --- Claude Health ---
    if (pathname === '/api/health/claude' && req.method === 'GET') {
        if (!USE_CLAUDE) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Claude is disabled');
            return;
        }

        if (CLAUDE_BASE_URL) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Claude LOCAL mode (model: ${CLAUDE_MODEL}, url: ${CLAUDE_BASE_URL})`);
        } else if (CLAUDE_API_KEY && CLAUDE_API_KEY !== 'sk-ant-your-key-here') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Claude CLOUD mode (model: ${CLAUDE_MODEL}, api.anthropic.com)`);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Claude enabled but not configured');
        }
        return;
    }

    // --- Config ---
    if (pathname === '/api/config' && req.method === 'GET') {
        // Determine the primary AI agent name from the fallback chain
        const primaryAgent = USE_GEMINI && GEMINI_API_KEYS.length > 0 ? 'Gemini'
            : USE_CLAUDE ? 'Claude'
            : OPENAI_API_KEY ? 'OpenAI'
            : USE_OLLAMA ? 'Ollama'
            : 'Enhanced Rule Engine';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            maxExperienceYears: MAX_EXPERIENCE_YEARS,
            experienceTiers: EXPERIENCE_TIERS.map(t => ({
                maxYears: t.maxYears,
                questions: t.questions
            })),
            // Frontend CONFIG values (from data/config.js)
            copyPasteEnabled:    APP_CONFIG.copyPasteEnabled,
            nextButtonEnabled:   APP_CONFIG.nextButtonEnabled,
            questionTimeLimits:  APP_CONFIG.questionTimeLimits,
            defaultTimeLimit:    APP_CONFIG.defaultTimeLimit,
            timerWarningAt:      APP_CONFIG.timerWarningAt,
            timerCountdownAt:    APP_CONFIG.timerCountdownAt,
            tabSwitchFreezeLimit:APP_CONFIG.tabSwitchFreezeLimit,
            autoSaveIntervalMs:  APP_CONFIG.autoSaveIntervalMs,
            instructionReadTimer:APP_CONFIG.instructionReadTimer,
            primaryAgent:        primaryAgent,
            panelistEmails:      Array.from(authorizedPanelistEmails),
            candidateEmailVerification: CANDIDATE_EMAIL_VERIFICATION
        }));
        return;
    }

    // --- Candidate Email Management (for panelists) ---
    if (pathname === '/api/candidate-emails' && req.method === 'GET') {
        // Read from CSV file directly so UI shows the actual file contents
        // (preserves original casing, works regardless of verification flag).
        let emails = [];
        try {
            if (fs.existsSync(CANDIDATE_EMAILS_CSV_PATH)) {
                const raw = fs.readFileSync(CANDIDATE_EMAILS_CSV_PATH, 'utf-8');
                const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                emails = lines.slice(1)
                    .map(line => line.split(',')[0].replace(/^"|"$/g, '').trim())
                    .filter(e => e && e.includes('@'));
            }
        } catch (err) {
            console.error('Failed to read candidate emails CSV:', err.message);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            enabled: CANDIDATE_EMAIL_VERIFICATION,
            count: emails.length,
            emails: emails,
            loggedIn: Array.from(loggedInCandidates),
            submitted: Array.from(submittedCandidates)
        }));
        return;
    }

    if (pathname === '/api/candidate-emails/reset-login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { email } = JSON.parse(body);
                if (email) {
                    loggedInCandidates.delete(email.trim().toLowerCase());
                    submittedCandidates.delete(email.trim().toLowerCase());
                    console.log(`✓ Login reset for candidate: ${email}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: `Login reset for ${email}` }));
                } else {
                    loggedInCandidates.clear();
                    submittedCandidates.clear();
                    console.log('✓ All candidate login records cleared');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'All login records cleared' }));
                }
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }

    if (pathname === '/api/candidate-emails/reload' && req.method === 'POST') {
        loadCandidateEmails();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'Candidate emails reloaded',
            count: authorizedCandidateEmails.size
        }));
        return;
    }

    // --- Panelist Email Management ---
    if (pathname === '/api/panelist-emails' && req.method === 'GET') {
        // Read from CSV file directly so UI shows original casing.
        let emails = [];
        try {
            if (fs.existsSync(PANELIST_EMAILS_CSV_PATH)) {
                const raw = fs.readFileSync(PANELIST_EMAILS_CSV_PATH, 'utf-8');
                const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                emails = lines.slice(1)
                    .map(line => line.split(',')[0].replace(/^"|"$/g, '').trim())
                    .filter(e => e && e.includes('@'));
            }
        } catch (err) {
            console.error('Failed to read panelist emails CSV:', err.message);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            count: emails.length,
            emails: emails
        }));
        return;
    }

    if (pathname === '/api/panelist-emails/reload' && req.method === 'POST') {
        loadPanelistEmails();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'Panelist emails reloaded',
            count: authorizedPanelistEmails.size
        }));
        return;
    }

    // --- Add / Remove Candidate Emails (writes back to CSV) ---
    if (pathname === '/api/candidate-emails/add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { email } = JSON.parse(body || '{}');
                const cleaned = (email || '').trim();
                const lower = cleaned.toLowerCase();
                if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email address' }));
                    return;
                }
                // Read existing CSV (source of truth, preserves casing)
                let existingLines = [];
                let header = 'email';
                if (fs.existsSync(CANDIDATE_EMAILS_CSV_PATH)) {
                    const raw = fs.readFileSync(CANDIDATE_EMAILS_CSV_PATH, 'utf-8');
                    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        header = lines[0];
                        existingLines = lines.slice(1);
                    }
                }
                // Duplicate check (case-insensitive)
                const alreadyExists = existingLines.some(l =>
                    l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase() === lower
                );
                if (alreadyExists) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email already exists' }));
                    return;
                }
                const updatedLines = [header, ...existingLines, cleaned];
                fs.writeFileSync(CANDIDATE_EMAILS_CSV_PATH, updatedLines.join('\n') + '\n', 'utf-8');
                authorizedCandidateEmails.add(lower);
                console.log(`\u2713 Candidate email added: ${cleaned}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Candidate email added: ${cleaned}`,
                    count: existingLines.length + 1
                }));
            } catch (err) {
                console.error('\u2717 Failed to add candidate email:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to add email: ' + err.message }));
            }
        });
        return;
    }

    if (pathname === '/api/candidate-emails/remove' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { email } = JSON.parse(body || '{}');
                const lower = (email || '').trim().toLowerCase();
                if (!lower) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email is required' }));
                    return;
                }
                if (!fs.existsSync(CANDIDATE_EMAILS_CSV_PATH)) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Candidate emails CSV not found' }));
                    return;
                }
                const raw = fs.readFileSync(CANDIDATE_EMAILS_CSV_PATH, 'utf-8');
                const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email not found' }));
                    return;
                }
                const header = lines[0];
                const dataLines = lines.slice(1);
                const filtered = dataLines.filter(l =>
                    l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase() !== lower
                );
                if (filtered.length === dataLines.length) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email not found' }));
                    return;
                }
                fs.writeFileSync(CANDIDATE_EMAILS_CSV_PATH, [header, ...filtered].join('\n') + '\n', 'utf-8');
                authorizedCandidateEmails.delete(lower);
                loggedInCandidates.delete(lower);
                submittedCandidates.delete(lower);
                console.log(`\u2713 Candidate email removed: ${lower}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Candidate email removed: ${lower}`,
                    count: filtered.length
                }));
            } catch (err) {
                console.error('\u2717 Failed to remove candidate email:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to remove email: ' + err.message }));
            }
        });
        return;
    }

    // --- Bulk Add Candidate Emails (from uploaded CSV/TXT) ---
    if (pathname === '/api/candidate-emails/bulk-add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { emails } = JSON.parse(body || '{}');
                if (!Array.isArray(emails)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Request must include an "emails" array' }));
                    return;
                }
                if (emails.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No emails provided' }));
                    return;
                }
                if (emails.length > 5000) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Too many emails in one request (max 5000)' }));
                    return;
                }

                // Read existing CSV
                let existingLines = [];
                let header = 'email';
                if (fs.existsSync(CANDIDATE_EMAILS_CSV_PATH)) {
                    const raw = fs.readFileSync(CANDIDATE_EMAILS_CSV_PATH, 'utf-8');
                    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        header = lines[0];
                        existingLines = lines.slice(1);
                    }
                }
                const existingLowerSet = new Set(existingLines.map(l =>
                    l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase()
                ));

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const result = { added: [], duplicates: [], invalid: [] };
                const newLines = [];
                const seenInBatch = new Set();

                for (const raw of emails) {
                    const cleaned = String(raw || '').trim();
                    const lower = cleaned.toLowerCase();
                    if (!cleaned || !emailRegex.test(cleaned)) {
                        if (cleaned) result.invalid.push(cleaned);
                        continue;
                    }
                    if (existingLowerSet.has(lower) || seenInBatch.has(lower)) {
                        result.duplicates.push(cleaned);
                        continue;
                    }
                    seenInBatch.add(lower);
                    newLines.push(cleaned);
                    result.added.push(cleaned);
                    authorizedCandidateEmails.add(lower);
                }

                if (newLines.length > 0) {
                    const allLines = [header, ...existingLines, ...newLines];
                    fs.writeFileSync(CANDIDATE_EMAILS_CSV_PATH, allLines.join('\n') + '\n', 'utf-8');
                    console.log(`\u2713 Bulk-added ${newLines.length} candidate email(s)`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Added ${result.added.length} candidate email(s). ${result.duplicates.length} duplicate(s), ${result.invalid.length} invalid skipped.`,
                    addedCount: result.added.length,
                    duplicateCount: result.duplicates.length,
                    invalidCount: result.invalid.length,
                    added: result.added,
                    duplicates: result.duplicates,
                    invalid: result.invalid,
                    totalCount: existingLines.length + newLines.length
                }));
            } catch (err) {
                console.error('\u2717 Bulk-add candidate emails failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bulk add failed: ' + err.message }));
            }
        });
        return;
    }

    // --- Bulk Remove Candidate Emails (from uploaded CSV/TXT/XLSX) ---
    if (pathname === '/api/candidate-emails/bulk-remove' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { emails } = JSON.parse(body || '{}');
                if (!Array.isArray(emails)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Request must include an "emails" array' }));
                    return;
                }
                if (emails.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No emails provided' }));
                    return;
                }
                if (emails.length > 5000) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Too many emails in one request (max 5000)' }));
                    return;
                }
                if (!fs.existsSync(CANDIDATE_EMAILS_CSV_PATH)) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Candidate emails CSV not found' }));
                    return;
                }
                const raw = fs.readFileSync(CANDIDATE_EMAILS_CSV_PATH, 'utf-8');
                const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: 'No emails to remove (CSV is empty).',
                        removedCount: 0, notFoundCount: 0, invalidCount: 0,
                        removed: [], notFound: [], invalid: [],
                        totalCount: 0
                    }));
                    return;
                }
                const header = lines[0];
                const dataLines = lines.slice(1);

                // Build a lookup of {lowercased -> raw line} for the existing CSV
                const existingByLower = new Map();
                for (const line of dataLines) {
                    const e = line.split(',')[0].replace(/^"|"$/g, '').trim();
                    if (e) existingByLower.set(e.toLowerCase(), line);
                }

                const result = { removed: [], notFound: [], invalid: [] };
                const toRemoveLower = new Set();
                for (const raw of emails) {
                    const cleaned = String(raw || '').trim();
                    const lower = cleaned.toLowerCase();
                    if (!cleaned) continue;
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
                        result.invalid.push(cleaned);
                        continue;
                    }
                    if (existingByLower.has(lower)) {
                        if (!toRemoveLower.has(lower)) {
                            toRemoveLower.add(lower);
                            result.removed.push(cleaned);
                        }
                    } else {
                        result.notFound.push(cleaned);
                    }
                }

                if (toRemoveLower.size > 0) {
                    const filtered = dataLines.filter(l => {
                        const e = l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase();
                        return !toRemoveLower.has(e);
                    });
                    fs.writeFileSync(CANDIDATE_EMAILS_CSV_PATH, [header, ...filtered].join('\n') + '\n', 'utf-8');
                    for (const lower of toRemoveLower) {
                        authorizedCandidateEmails.delete(lower);
                        loggedInCandidates.delete(lower);
                        submittedCandidates.delete(lower);
                    }
                    console.log(`\u2713 Bulk-removed ${toRemoveLower.size} candidate email(s)`);
                }

                const finalCount = dataLines.length - toRemoveLower.size;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Removed ${result.removed.length} candidate email(s). ${result.notFound.length} not found, ${result.invalid.length} invalid skipped.`,
                    removedCount: result.removed.length,
                    notFoundCount: result.notFound.length,
                    invalidCount: result.invalid.length,
                    removed: result.removed,
                    notFound: result.notFound,
                    invalid: result.invalid,
                    totalCount: finalCount
                }));
            } catch (err) {
                console.error('\u2717 Bulk-remove candidate emails failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bulk remove failed: ' + err.message }));
            }
        });
        return;
    }

    // --- Add / Remove Panelist Emails (writes back to CSV) ---
    if (pathname === '/api/panelist-emails/add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { email } = JSON.parse(body || '{}');
                const cleaned = (email || '').trim();
                const lower = cleaned.toLowerCase();
                if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email address' }));
                    return;
                }
                let existingLines = [];
                let header = 'email';
                if (fs.existsSync(PANELIST_EMAILS_CSV_PATH)) {
                    const raw = fs.readFileSync(PANELIST_EMAILS_CSV_PATH, 'utf-8');
                    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        header = lines[0];
                        existingLines = lines.slice(1);
                    }
                }
                const alreadyExists = existingLines.some(l =>
                    l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase() === lower
                );
                if (alreadyExists) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email already exists' }));
                    return;
                }
                const updatedLines = [header, ...existingLines, cleaned];
                fs.writeFileSync(PANELIST_EMAILS_CSV_PATH, updatedLines.join('\n') + '\n', 'utf-8');
                authorizedPanelistEmails.add(lower);
                console.log(`\u2713 Panelist email added: ${cleaned}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Panelist email added: ${cleaned}`,
                    count: existingLines.length + 1
                }));
            } catch (err) {
                console.error('\u2717 Failed to add panelist email:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to add email: ' + err.message }));
            }
        });
        return;
    }

    if (pathname === '/api/panelist-emails/remove' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { email, requesterEmail } = JSON.parse(body || '{}');
                const lower = (email || '').trim().toLowerCase();
                const requester = (requesterEmail || '').trim().toLowerCase();
                if (!lower) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email is required' }));
                    return;
                }
                // Safety: prevent self-removal (would lose access immediately)
                if (requester && lower === requester) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'You cannot remove your own panelist access while logged in.'
                    }));
                    return;
                }
                if (!fs.existsSync(PANELIST_EMAILS_CSV_PATH)) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Panelist emails CSV not found' }));
                    return;
                }
                const raw = fs.readFileSync(PANELIST_EMAILS_CSV_PATH, 'utf-8');
                const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email not found' }));
                    return;
                }
                const header = lines[0];
                const dataLines = lines.slice(1);
                // Safety: don't allow removing the last panelist
                if (dataLines.length <= 1) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Cannot remove the last remaining panelist.' }));
                    return;
                }
                const filtered = dataLines.filter(l =>
                    l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase() !== lower
                );
                if (filtered.length === dataLines.length) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email not found' }));
                    return;
                }
                fs.writeFileSync(PANELIST_EMAILS_CSV_PATH, [header, ...filtered].join('\n') + '\n', 'utf-8');
                authorizedPanelistEmails.delete(lower);
                console.log(`\u2713 Panelist email removed: ${lower}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Panelist email removed: ${lower}`,
                    count: filtered.length
                }));
            } catch (err) {
                console.error('\u2717 Failed to remove panelist email:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to remove email: ' + err.message }));
            }
        });
        return;
    }

    // --- Bulk Add Panelist Emails (from uploaded CSV/TXT) ---
    if (pathname === '/api/panelist-emails/bulk-add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { emails } = JSON.parse(body || '{}');
                if (!Array.isArray(emails)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Request must include an "emails" array' }));
                    return;
                }
                if (emails.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No emails provided' }));
                    return;
                }
                if (emails.length > 5000) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Too many emails in one request (max 5000)' }));
                    return;
                }

                let existingLines = [];
                let header = 'email';
                if (fs.existsSync(PANELIST_EMAILS_CSV_PATH)) {
                    const raw = fs.readFileSync(PANELIST_EMAILS_CSV_PATH, 'utf-8');
                    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        header = lines[0];
                        existingLines = lines.slice(1);
                    }
                }
                const existingLowerSet = new Set(existingLines.map(l =>
                    l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase()
                ));

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const result = { added: [], duplicates: [], invalid: [] };
                const newLines = [];
                const seenInBatch = new Set();

                for (const raw of emails) {
                    const cleaned = String(raw || '').trim();
                    const lower = cleaned.toLowerCase();
                    if (!cleaned || !emailRegex.test(cleaned)) {
                        if (cleaned) result.invalid.push(cleaned);
                        continue;
                    }
                    if (existingLowerSet.has(lower) || seenInBatch.has(lower)) {
                        result.duplicates.push(cleaned);
                        continue;
                    }
                    seenInBatch.add(lower);
                    newLines.push(cleaned);
                    result.added.push(cleaned);
                    authorizedPanelistEmails.add(lower);
                }

                if (newLines.length > 0) {
                    const allLines = [header, ...existingLines, ...newLines];
                    fs.writeFileSync(PANELIST_EMAILS_CSV_PATH, allLines.join('\n') + '\n', 'utf-8');
                    console.log(`\u2713 Bulk-added ${newLines.length} panelist email(s)`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Added ${result.added.length} panelist email(s). ${result.duplicates.length} duplicate(s), ${result.invalid.length} invalid skipped.`,
                    addedCount: result.added.length,
                    duplicateCount: result.duplicates.length,
                    invalidCount: result.invalid.length,
                    added: result.added,
                    duplicates: result.duplicates,
                    invalid: result.invalid,
                    totalCount: existingLines.length + newLines.length
                }));
            } catch (err) {
                console.error('\u2717 Bulk-add panelist emails failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bulk add failed: ' + err.message }));
            }
        });
        return;
    }

    // --- Bulk Remove Panelist Emails (from uploaded CSV/TXT/XLSX) ---
    if (pathname === '/api/panelist-emails/bulk-remove' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { emails, requesterEmail } = JSON.parse(body || '{}');
                if (!Array.isArray(emails)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Request must include an "emails" array' }));
                    return;
                }
                if (emails.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No emails provided' }));
                    return;
                }
                if (emails.length > 5000) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Too many emails in one request (max 5000)' }));
                    return;
                }
                if (!fs.existsSync(PANELIST_EMAILS_CSV_PATH)) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Panelist emails CSV not found' }));
                    return;
                }
                const requester = (requesterEmail || '').trim().toLowerCase();
                const raw = fs.readFileSync(PANELIST_EMAILS_CSV_PATH, 'utf-8');
                const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: 'No emails to remove (CSV is empty).',
                        removedCount: 0, notFoundCount: 0, invalidCount: 0,
                        removed: [], notFound: [], invalid: [], skippedSelf: [],
                        totalCount: 0
                    }));
                    return;
                }
                const header = lines[0];
                const dataLines = lines.slice(1);

                const existingByLower = new Map();
                for (const line of dataLines) {
                    const e = line.split(',')[0].replace(/^"|"$/g, '').trim();
                    if (e) existingByLower.set(e.toLowerCase(), line);
                }

                const result = { removed: [], notFound: [], invalid: [], skippedSelf: [] };
                const toRemoveLower = new Set();

                for (const raw of emails) {
                    const cleaned = String(raw || '').trim();
                    const lower = cleaned.toLowerCase();
                    if (!cleaned) continue;
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
                        result.invalid.push(cleaned);
                        continue;
                    }
                    // Safety: never remove the requester's own panelist access
                    if (requester && lower === requester) {
                        result.skippedSelf.push(cleaned);
                        continue;
                    }
                    if (existingByLower.has(lower)) {
                        if (!toRemoveLower.has(lower)) {
                            toRemoveLower.add(lower);
                            result.removed.push(cleaned);
                        }
                    } else {
                        result.notFound.push(cleaned);
                    }
                }

                // Safety: don't allow this request to wipe out the panelist list entirely
                const remaining = dataLines.length - toRemoveLower.size;
                if (remaining < 1) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Refusing to remove the last remaining panelist(s). At least one must stay.'
                    }));
                    return;
                }

                if (toRemoveLower.size > 0) {
                    const filtered = dataLines.filter(l => {
                        const e = l.split(',')[0].replace(/^"|"$/g, '').trim().toLowerCase();
                        return !toRemoveLower.has(e);
                    });
                    fs.writeFileSync(PANELIST_EMAILS_CSV_PATH, [header, ...filtered].join('\n') + '\n', 'utf-8');
                    for (const lower of toRemoveLower) authorizedPanelistEmails.delete(lower);
                    console.log(`\u2713 Bulk-removed ${toRemoveLower.size} panelist email(s)`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: `Removed ${result.removed.length} panelist email(s). ${result.notFound.length} not found, ${result.invalid.length} invalid skipped.${result.skippedSelf.length ? ' Your own email was skipped for safety.' : ''}`,
                    removedCount: result.removed.length,
                    notFoundCount: result.notFound.length,
                    invalidCount: result.invalid.length,
                    removed: result.removed,
                    notFound: result.notFound,
                    invalid: result.invalid,
                    skippedSelf: result.skippedSelf,
                    totalCount: remaining
                }));
            } catch (err) {
                console.error('\u2717 Bulk-remove panelist emails failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bulk remove failed: ' + err.message }));
            }
        });
        return;
    }

    // --- Questions ---
    if (pathname === '/api/questions' && req.method === 'GET') {
        try {
            const questionsData = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
            let questions = questionsData.questions || [];

            if (query.experience) {
                const yearsExp = parseFloat(query.experience);
                questions = getQuestionsByExperience(questions, yearsExp);
            } else if (query.count) {
                const count = parseInt(query.count);
                questions = shuffleArray(questions).slice(0, count);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ questions }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load questions' }));
        }
        return;
    }

    // --- Single Question ---
    if (pathname.match(/^\/api\/questions\/\d+$/) && req.method === 'GET') {
        const id = parseInt(pathname.split('/').pop());
        try {
            const questionsData = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
            const question = questionsData.questions.find(q => q.id === id);
            if (question) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(question));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Question not found' }));
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load question' }));
        }
        return;
    }

    // --- Execute Java ---
    if (pathname === '/api/execute/java' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                let { code, input } = JSON.parse(body);
                const stdinInput = input || null;
                const tempDir = TEMP_DIR;

                // Sanitize code
                code = code.replace(/^\uFEFF/, '');
                code = code.replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, ' ');
                code = code.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
                code = code.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
                code = code.replace(/[\u2013\u2014]/g, '-');
                code = code.replace(/\r\n/g, '\n');

                const classNameMatch = code.match(/public\s+class\s+(\w+)/);
                const originalClassName = classNameMatch ? classNameMatch[1] : 'Main';

                let modifiedCode = code.replace(/public\s+class\s+\w+/g, 'public class TempProgram');
                if (!modifiedCode.includes('class TempProgram')) {
                    modifiedCode = modifiedCode.replace(/class\s+\w+/, 'class TempProgram');
                }

                const javaFile = path.join(tempDir, 'TempProgram.java');
                await fs.promises.writeFile(javaFile, modifiedCode, 'utf8');

                const cleanup = () => {
                    try { fs.unlinkSync(javaFile); } catch {}
                    try {
                        const files = fs.readdirSync(tempDir);
                        files.forEach(f => {
                            if (f.startsWith('TempProgram') && f.endsWith('.class')) {
                                try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
                            }
                        });
                    } catch {}
                };

                const cleanError = (msg) => {
                    return msg
                        .replace(/TempProgram\.java/g, `${originalClassName}.java`)
                        .replace(/TempProgram/g, originalClassName)
                        .trim();
                };

                // Compile
                try {
                    const javacCmd = `"${JAVAC_CMD}" -J-XX:TieredStopAtLevel=1 TempProgram.java`;
                    await execAsync(javacCmd, { cwd: tempDir, timeout: 15000 });
                } catch (compileErr) {
                    cleanup();
                    const rawError = compileErr.stderr || compileErr.message || 'Compilation failed';
                    const errorMsg = cleanError(rawError);
                    console.log(`[Java] Compilation error for ${originalClassName}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        phase: 'compilation',
                        error: errorMsg,
                        output: ''
                    }));
                    return;
                }

                // Run
                try {
                    let stdout, stderr;
                    if (stdinInput) {
                        console.log(`[Java] Providing stdin input: ${JSON.stringify(stdinInput.substring(0, 100))}`);
                        const result = await spawnWithInput(JAVA_CMD, ['-XX:TieredStopAtLevel=1', 'TempProgram'], { cwd: tempDir, timeout: 10000 }, stdinInput);
                        stdout = result.stdout;
                        stderr = result.stderr;
                    } else {
                        const javaRunCmd = `"${JAVA_CMD}" -XX:TieredStopAtLevel=1 TempProgram`;
                        const result = await execAsync(javaRunCmd, { cwd: tempDir, timeout: 10000 });
                        stdout = result.stdout;
                        stderr = result.stderr;
                    }
                    cleanup();

                    const output = stdout || '';
                    const warnings = stderr || '';
                    console.log(`[Java] Success. Output: "${output.trim()}"`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        phase: 'execution',
                        output: output.trim(),
                        warnings: warnings.trim()
                    }));
                } catch (runtimeErr) {
                    cleanup();
                    const rawError = runtimeErr.stderr || runtimeErr.message || 'Runtime error';
                    let errorMsg = cleanError(rawError);

                    if (runtimeErr.killed || (runtimeErr.signal === 'SIGTERM')) {
                        errorMsg = 'Error: Time limit exceeded (10s). Check for infinite loops or long-running operations.';
                    }

                    console.log(`[Java] Runtime error for ${originalClassName}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        phase: 'execution',
                        error: errorMsg,
                        output: runtimeErr.stdout ? runtimeErr.stdout.trim() : ''
                    }));
                }
            } catch (err) {
                console.error(`[Java] Server error:`, err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error during execution' }));
            }
        });
        return;
    }

    // --- Execute Python ---
    if (pathname === '/api/execute/python' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                let { code, input } = JSON.parse(body);
                const stdinInput = input || null;
                const tempDir = TEMP_DIR;

                // Sanitize code
                code = code.replace(/^\uFEFF/, '');
                code = code.replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, ' ');
                code = code.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
                code = code.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
                code = code.replace(/[\u2013\u2014]/g, '-');
                code = code.replace(/\r\n/g, '\n');

                const pythonFile = path.join(tempDir, 'temp_script.py');
                await fs.promises.writeFile(pythonFile, code, 'utf8');

                const cleanup = () => {
                    try { fs.unlinkSync(pythonFile); } catch {}
                    try {
                        const cacheDir = path.join(tempDir, '__pycache__');
                        if (fs.existsSync(cacheDir)) {
                            fs.readdirSync(cacheDir).forEach(f => {
                                try { fs.unlinkSync(path.join(cacheDir, f)); } catch {}
                            });
                            fs.rmdirSync(cacheDir);
                        }
                    } catch {}
                };

                const pythonCmd = PYTHON_CMD;
                const pythonCommands = [pythonCmd];
                if (pythonCmd !== 'python') pythonCommands.push('python');
                if (pythonCmd !== 'python3') pythonCommands.push('python3');
                let lastError = null;

                for (const pyCmd of pythonCommands) {
                    try {
                        let stdout, stderr;
                        if (stdinInput) {
                            console.log(`[Python] Providing stdin input: ${JSON.stringify(stdinInput.substring(0, 100))}`);
                            const result = await spawnWithInput(pyCmd, [pythonFile], { timeout: 10000 }, stdinInput);
                            stdout = result.stdout;
                            stderr = result.stderr;
                        } else {
                            const result = await execAsync(`"${pyCmd}" "${pythonFile}"`, { timeout: 10000 });
                            stdout = result.stdout;
                            stderr = result.stderr;
                        }
                        cleanup();

                        const output = stdout || '';
                        const warnings = stderr || '';
                        console.log(`[Python] Success (using: ${pyCmd}). Output: "${output.trim()}"`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            phase: 'execution',
                            output: output.trim(),
                            warnings: warnings.trim()
                        }));
                        return;
                    } catch (err) {
                        if (err.stderr && (err.stderr.includes('Traceback') || err.stderr.includes('SyntaxError') || err.stderr.includes('Error'))) {
                            cleanup();
                            let errorMsg = err.stderr.trim();
                            errorMsg = errorMsg.replace(/File ".*temp_script\.py"/g, 'File "script.py"');

                            if (err.killed || err.signal === 'SIGTERM') {
                                errorMsg = 'Error: Time limit exceeded (10s). Check for infinite loops or long-running operations.';
                            }

                            const partialOutput = err.stdout ? err.stdout.trim() : '';
                            console.log(`[Python] Runtime error`);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                phase: 'execution',
                                error: errorMsg,
                                output: partialOutput
                            }));
                            return;
                        }
                        lastError = err;
                        continue;
                    }
                }

                cleanup();
                console.log(`[Python] No Python interpreter found`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    phase: 'setup',
                    error: 'Python interpreter not found. Run setup-runtimes.bat to install portable Python, or install Python on your system.',
                    output: ''
                }));
            } catch (err) {
                console.error(`[Python] Server error:`, err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error during execution' }));
            }
        });
        return;
    }

    // --- Execute JavaScript ---
    if (pathname === '/api/execute/javascript' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                let { code, input } = JSON.parse(body);
                const stdinInput = input || null;
                const tempDir = TEMP_DIR;

                // Sanitize code
                code = code.replace(/^\uFEFF/, '');
                code = code.replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, ' ');
                code = code.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
                code = code.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
                code = code.replace(/[\u2013\u2014]/g, '-');
                code = code.replace(/\r\n/g, '\n');

                const jsFile = path.join(tempDir, 'temp_script.js');
                await fs.promises.writeFile(jsFile, code, 'utf8');

                const cleanup = () => {
                    try { fs.unlinkSync(jsFile); } catch {}
                };

                try {
                    let stdout, stderr;
                    if (stdinInput) {
                        console.log(`[JavaScript] Providing stdin input: ${JSON.stringify(stdinInput.substring(0, 100))}`);
                        const result = await spawnWithInput(process.execPath, [jsFile], { timeout: 10000 }, stdinInput);
                        stdout = result.stdout;
                        stderr = result.stderr;
                    } else {
                        const result = await execAsync(`"${process.execPath}" "${jsFile}"`, { timeout: 10000 });
                        stdout = result.stdout;
                        stderr = result.stderr;
                    }
                    cleanup();

                    const output = stdout || '';
                    const warnings = stderr || '';
                    console.log(`[JavaScript] Success. Output: "${output.trim()}"`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        phase: 'execution',
                        output: output.trim(),
                        warnings: warnings.trim()
                    }));
                } catch (runtimeErr) {
                    cleanup();
                    let errorMsg = runtimeErr.stderr || runtimeErr.message || 'Runtime error';
                    // Clean up temp file paths from error messages
                    errorMsg = errorMsg.replace(new RegExp(jsFile.replace(/\\/g, '\\\\'), 'g'), 'script.js');
                    errorMsg = errorMsg.replace(/temp_script\.js/g, 'script.js').trim();

                    if (runtimeErr.killed || runtimeErr.signal === 'SIGTERM') {
                        errorMsg = 'Error: Time limit exceeded (10s). Check for infinite loops or long-running operations.';
                    }

                    const partialOutput = runtimeErr.stdout ? runtimeErr.stdout.trim() : '';
                    console.log(`[JavaScript] Runtime error`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        phase: 'execution',
                        error: errorMsg,
                        output: partialOutput
                    }));
                }
            } catch (err) {
                console.error(`[JavaScript] Server error:`, err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error during execution' }));
            }
        });
        return;
    }

    // --- Agent Assist ---
    if (pathname === '/api/agent/assist' && req.method === 'POST') {
        let body = '';
        let aborted = false;

        req.on('aborted', () => { aborted = true; });
        req.on('data', chunk => { if (!aborted) body += chunk; });

        req.on('end', async () => {
            if (aborted) {
                res.writeHead(499, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request cancelled' }));
                return;
            }

            try {
                const { language, userCode, questionTitle, questionDescription, lastError, outputMatched } = JSON.parse(body);
                const mode = 'percentage';
                let result = null;
                let agentUsed = 'none';
                const agentStatus = { claude: 'disabled', ollama: 'disabled', openai: 'disabled' };

                // SHORTCUT: If client reports output didn't match -> return 0% immediately
                if (outputMatched === false) {
                    console.log('[Agent] Output mismatch reported — returning 0%');
                    result = {
                        suggestions: ['Output does not match expected result. Agent Score: 0%'],
                        warnings: [], confidence: 'high', revisedCode: userCode, percentage: 0
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, ...result, mode, agentUsed: 'output-check', agentStatus }));
                    return;
                }

                console.log(`[Agent] mode=${mode}, USE_CLAUDE=${USE_CLAUDE}, USE_OLLAMA=${USE_OLLAMA}, OPENAI_KEY=${OPENAI_API_KEY ? 'set' : 'not set'}`);

                const callArgs = [
                    'Evaluate code correctness percentage.',
                    mode, language, userCode, lastError, questionTitle, questionDescription
                ];

                // === FALLBACK CHAIN ===

                // 0. Try Google Gemini first (PRIMARY AGENT - FREE)
                if (!aborted && USE_GEMINI && GEMINI_API_KEYS.length > 0) {
                    agentStatus.gemini = 'trying';

                    const maxAttempts = GEMINI_API_KEYS.length * GEMINI_MODELS.length;
                    let attempt = 0;

                    while (attempt < maxAttempts && (!result || (result.quotaError && attempt < maxAttempts))) {
                        const currentApiKey = getCurrentGeminiApiKey();
                        const currentModel = GEMINI_MODELS[GEMINI_MODEL_INDEX];
                        attempt++;

                        console.log('[Agent] Trying Gemini model:', currentModel, 'with API key', currentApiKey.substring(0, 10) + '...', '(attempt', attempt + '/' + maxAttempts + ')');

                        result = await callGemini(...callArgs, currentModel, currentApiKey);
                        if (aborted) { res.writeHead(499); res.end(JSON.stringify({ error: 'Request cancelled' })); return; }

                        if (result && result.percentage !== undefined && result.percentage !== null) {
                            agentUsed = 'Gemini (' + result.usedModel + ')';
                            agentStatus.gemini = 'yes';
                            console.log('[Agent] Using Gemini with percentage:', result.percentage, 'model:', result.usedModel);
                            break;
                        } else if (result && result.confidence && result.confidence === 'high') {
                            agentUsed = 'Gemini (' + result.usedModel + ')';
                            agentStatus.gemini = 'yes';
                            console.log('[Agent] Using Gemini with high confidence');
                            break;
                        } else {
                            if (result && (result.quotaError || result.modelNotFound)) {
                                const reason = result.quotaError ? 'quota exceeded' : 'model not found';
                                console.log('[Agent]', reason, 'on', currentModel + ', trying next combination...');

                                getNextGeminiModel();

                                if (GEMINI_MODEL_INDEX === 0) {
                                    getNextGeminiApiKey();
                                }

                                result = null;
                                continue;
                            }
                            agentStatus.gemini = 'failed';
                            console.log('[Agent] Gemini failed or returned low confidence, falling back to other agents');
                            result = null;
                            break;
                        }
                    }
                }

                // 1. Try Claude second
                if (!result || (result.confidence !== 'high' && !result.percentage)) {
                    if (!aborted && USE_CLAUDE) {
                        agentStatus.claude = 'trying';
                        result = await callClaude(...callArgs);
                        if (aborted) { res.writeHead(499); res.end(JSON.stringify({ error: 'Request cancelled' })); return; }
                        if (result && result.confidence === 'high') {
                            agentUsed = 'Claude';
                            agentStatus.claude = 'yes';
                        } else {
                            agentStatus.claude = 'failed';
                            result = null;
                        }
                    }
                }

                // 2. Try OpenAI
                if (!result || (result.confidence !== 'high' && !result.percentage)) {
                    if (!aborted && OPENAI_API_KEY) {
                        agentStatus.openai = 'trying';
                        result = await callOpenAI(...callArgs);
                        if (aborted) { res.writeHead(499); res.end(JSON.stringify({ error: 'Request cancelled' })); return; }
                        if (result && result.confidence === 'high') {
                            agentUsed = 'OpenAI (' + OPENAI_MODEL + ')';
                            agentStatus.openai = 'yes';
                        } else {
                            agentStatus.openai = 'failed';
                            result = null;
                        }
                    }
                }

                // 3. Try Ollama as last resort
                if (!result || (result.confidence !== 'high' && !result.percentage)) {
                    if (!aborted && USE_OLLAMA) {
                        agentStatus.ollama = 'trying';
                        result = await callOllama(...callArgs);
                        if (aborted) { res.writeHead(499); res.end(JSON.stringify({ error: 'Request cancelled' })); return; }
                        if (result && result.confidence === 'high') {
                            agentUsed = 'Ollama (' + OLLAMA_MODEL + ')';
                            agentStatus.ollama = 'yes';
                        } else {
                            agentStatus.ollama = 'failed';
                        }
                    }
                }

                // 4. All failed fallback — use Enhanced Rule-Based Scoring Engine
                if (!result || (result.confidence !== 'high' && !result.percentage)) {
                    // If an agent responded with high confidence but no percentage, try to extract it from the text before giving up
                    if (result && result.confidence === 'high' && result.suggestions && result.suggestions[0]) {
                        const rescuePct = extractPercentage(String(result.suggestions[0]));
                        if (typeof rescuePct === 'number' && Number.isFinite(rescuePct)) {
                            result.percentage = rescuePct;
                        }
                    }
                    // If we still have no usable result, fall back to the rule-based scoring engine
                    if (!result || (!result.percentage && result.percentage !== 0)) {
                        console.log('[Agent] All AI providers failed or disabled — falling back to Enhanced Rule-Based Scoring Engine');
                        // Look up full question from questions.json for templates & difficulty
                        let fullQuestion = { title: questionTitle, description: questionDescription };
                        try {
                            const qData = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
                            const match = (qData.questions || []).find(q =>
                                (q.title || '').toLowerCase() === (questionTitle || '').toLowerCase()
                            );
                            if (match) fullQuestion = match;
                        } catch (e) { /* use basic question object */ }
                        const ruleResult = runRuleBasedAgentAssist(
                            fullQuestion,
                            userCode, language, mode
                        );
                        result = {
                            suggestions: [ruleResult.explanation || 'Scored by rule-based engine'],
                            warnings: ['All AI providers were unavailable. Score generated by Enhanced Rule-Based Scoring Engine.'],
                            confidence: 'medium',
                            revisedCode: userCode,
                            percentage: ruleResult.percentage,
                            covered: ruleResult.covered || [],
                            missed: ruleResult.missed || []
                        };
                        agentUsed = ruleResult.agentUsed || 'enhanced-rule-engine';
                        agentStatus.ruleEngine = 'yes';
                        console.log('[Agent] Rule-based engine score:', ruleResult.percentage);
                    }
                }

                let finalPercentage = (typeof result.percentage === 'number' && Number.isFinite(result.percentage))
                    ? Math.max(0, Math.min(100, Math.round(result.percentage)))
                    : null;

                if (finalPercentage === null) {
                    const firstSuggestion = (result.suggestions && result.suggestions[0]) || '';
                    const parsedFromText = extractPercentage(String(firstSuggestion));
                    if (typeof parsedFromText === 'number' && Number.isFinite(parsedFromText)) {
                        finalPercentage = parsedFromText;
                    }
                }

                if (finalPercentage === null) {
                    finalPercentage = 0;
                    if (!agentUsed || agentUsed === 'none') {
                        agentUsed = 'No AI agent available';
                    }
                    if (!result.suggestions || result.suggestions.length === 0) {
                        result.suggestions = ['All AI providers failed. Please try again later when quota is available or configure other providers (OpenAI, Claude, Ollama).'];
                    }
                }

                result.percentage = finalPercentage;

                console.log(`[Agent] Result: agent=${agentUsed}, confidence=${result?.confidence}, percentage=${result?.percentage}`);
                const explanation = (result.suggestions && result.suggestions[0]) || '';

                if ((!result.covered || result.covered.length === 0) && (!result.missed || result.missed.length === 0)) {
                    const parsed = parseAIFeedback(explanation);
                    if (!result.covered) result.covered = parsed.covered || [];
                    if (!result.missed) result.missed = parsed.missed || [];
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ...result, explanation, mode, agentUsed, agentStatus }));
            } catch (err) {
                console.error('[Agent] Error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Agent assist failed', error: err.message }));
            }
        });
        return;
    }

    // --- Save Result ---
    if (pathname === '/api/result' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { personName, email, location, experienceYears, preferredLanguage, programsCompleted, totalPrograms,
                        results, tabSwitchCount, totalTimeTaken, agentAnalysis, aiLikelihood } = data;

                // Mark candidate as submitted — blocks future re-login
                if (email) {
                    submittedCandidates.add(email.trim().toLowerCase());
                    console.log(`✓ Candidate assessment submitted: ${email}`);
                }

                const safeName = (personName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
                const today = getISTTimestamp().split('T')[0];
                const time = getISTTimestamp().split('T')[1].split('+')[0];

                function escapeCsvField(value) {
                    if (value == null) return '""';
                    let s = String(value).replace(/\r\n|\n|\r/g, ' ');
                    // Always double-quote every field for maximum CSV compatibility
                    s = '"' + s.replace(/"/g, '""') + '"';
                    return s;
                }

                function formatSeconds(totalSec) {
                    const sec = Number(totalSec) || 0;
                    const h = Math.floor(sec / 3600);
                    const m = Math.floor((sec % 3600) / 60);
                    const s = sec % 60;
                    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    return `${m}:${String(s).padStart(2,'0')}`;
                }

                // 1. Save JSON result
                const jsonDir = path.join(__dirname, '../results/json');
                if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });
                const timestamp = getISTTimestamp().replace(/[:.]/g, '-');
                const jsonFile = path.join(jsonDir, `${safeName}-coding-results-${timestamp}.json`);
                fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));

                // 2. Per-candidate CSV
                const csvDir = path.join(__dirname, '../results/csv');
                if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
                const csvFile = path.join(csvDir, `${safeName}-performance.csv`);

                const csvHeaders = 'Date,Time,Candidate Name,Candidate EmailId,Location,Relevant Experience (Years),Question #,Question Title,Status,Language,Expected Output,Actual Output,Agent Score (%),Plagiarism (%),Plagiarism Reasons,Session Completion (%),Session Agent Analysis Avg (%),Tab Switches,Question Time Spent,Total Time Taken';

                let csvContent = '';
                if (!fs.existsSync(csvFile)) {
                    csvContent = csvHeaders + '\n';
                } else {
                    csvContent = fs.readFileSync(csvFile, 'utf-8');
                }

                const correctCount = (results || []).filter(r => r.completed).length;
                const sessionCompletion = totalPrograms > 0 ? Math.round((correctCount / totalPrograms) * 100) : 0;
                const sessionAgentAvg = agentAnalysis ? agentAnalysis.averagePercentage : 0;
                const formattedTime = formatSeconds(totalTimeTaken);

                for (const [idx, r] of (results || []).entries()) {
                    let status = 'Not Attempted';
                    let agentPercentage = r.agentPercentage || 0;
                    let actualOutput = r.actualOutput || '';
                    // Handle object type actualOutput
                    if (typeof actualOutput === 'object' && actualOutput !== null) {
                        try { actualOutput = JSON.stringify(actualOutput); } catch(e) { actualOutput = ''; }
                    }
                    // Clean up any stringified [object Object]
                    if (String(actualOutput).trim() === '[object Object]') actualOutput = '';
                    let errorMsg = '';

                    // Hardcoded output detection
                    if (r && r.userCode) {
                        let isHardcoded = false;
                        if (r.language === 'java') {
                            let code = r.userCode.replace(/import\s+[\w.*]+;/g, '')
                                .replace(/public\s+class\s+\w+\s*\{/g, '')
                                .replace(/public\s+static\s+void\s+main\s*\([^)]*\)\s*\{/g, '')
                                .replace(/\/\/.*$/gm, '')
                                .replace(/\/\*[\s\S]*?\*\//g, '')
                                .replace(/^\s*\}\s*$/gm, '')
                                .trim();
                            const onlyPrints = code.replace(/System\.out\.print(ln)?\s*\([\s\S]*?\);?/g, '').trim().length === 0;
                            if (onlyPrints) isHardcoded = true;
                        } else if (r.language === 'python') {
                            let code = r.userCode.replace(/#.*$/gm, '')
                                .replace(/'''[\s\S]*?'''/g, '').replace(/"""[\s\S]*?"""/g, '')
                                .trim();
                            const onlyPrints = code.replace(/print\s*\([\s\S]*?\)/g, '').trim().length === 0;
                            if (onlyPrints) isHardcoded = true;
                        } else if (r.language === 'javascript') {
                            let code = r.userCode.replace(/\/\/.*$/gm, '')
                                .replace(/\/\*[\s\S]*?\*\//g, '')
                                .trim();
                            const onlyPrints = code.replace(/console\.log\s*\([\s\S]*?\);?/g, '').trim().length === 0;
                            if (onlyPrints) isHardcoded = true;
                        }
                        if (isHardcoded) {
                            agentPercentage = 0;
                            status = 'Incorrect';
                            errorMsg = 'Hardcoded output detected \u2013 wrong output';
                            actualOutput = '[Hardcoded Output]';
                            r._forceIncorrect = true;
                        }
                        if (!r._forceIncorrect) {
                            if (r.completed) status = 'Correct';
                            else if (r.attempted) status = 'Incorrect';
                        }
                    }

                    const perQuestionTabSwitch = r.tabSwitchCount !== undefined ? r.tabSwitchCount : 0;
                    const questionTimeSpent = r.questionTimeSpent !== undefined ? formatSeconds(r.questionTimeSpent) : 'N/A';

                    const row = [
                        escapeCsvField(today),
                        escapeCsvField(time),
                        escapeCsvField(personName),
                        escapeCsvField(email),
                        escapeCsvField(location || ''),
                        escapeCsvField(experienceYears),
                        escapeCsvField(idx + 1),
                        escapeCsvField(r.title || ''),
                        escapeCsvField(status),
                        escapeCsvField((r.language || 'java').toUpperCase()),
                        escapeCsvField(r.expectedOutput || ''),
                        escapeCsvField(actualOutput),
                        escapeCsvField(agentPercentage),
                        escapeCsvField(r.aiLikelihood || 0),
                        escapeCsvField((r.aiReasons || []).join('; ') + (errorMsg ? ('; ' + errorMsg) : '')),
                        escapeCsvField(sessionCompletion),
                        escapeCsvField(sessionAgentAvg),
                        escapeCsvField(perQuestionTabSwitch),
                        escapeCsvField(questionTimeSpent),
                        escapeCsvField(formattedTime)
                    ].join(',');
                    csvContent += row + '\n';
                }

                fs.writeFileSync(csvFile, csvContent);

                // 3. Consolidated daily CSV
                const consolidatedFile = path.join(csvDir, `all-candidates-summary-${today}.csv`);

                // Build per-question tab switch headers dynamically
                const numQuestions = (results || []).length;
                const perQTabHeaders = [];
                for (let qi = 1; qi <= numQuestions; qi++) {
                    perQTabHeaders.push(`Q${qi} Tab Switches`);
                }
                const conHeaders = 'Date,Time,Candidate Name,Candidate Emailid,Location,Relevant Experience (Years),Language Preferred,Correct Programs,Test Execution Score (%),Agent Score (%),Plagiarism Avg (%),Plagiarism Max (%),' + perQTabHeaders.join(',') + ',Total Tab Switches,Total Time Taken';

                let consolidatedContent = '';
                if (!fs.existsSync(consolidatedFile)) {
                    consolidatedContent = conHeaders + '\n';
                } else {
                    consolidatedContent = fs.readFileSync(consolidatedFile, 'utf-8');
                    const existingLines = consolidatedContent.split('\n');

                    // Determine how many Q columns the current header has (if any)
                    const oldHasPerQ = existingLines[0].includes('Q1 Tab Switches');
                    const oldQCount = oldHasPerQ ? (existingLines[0].match(/Q\d+ Tab Switches/g) || []).length : 0;
                    const targetQCount = numQuestions;

                    if (!oldHasPerQ || targetQCount > oldQCount) {
                        // Need to upgrade header and migrate old data rows
                        existingLines[0] = conHeaders;

                        // Migrate data rows from old format to new format
                        for (let li = 1; li < existingLines.length; li++) {
                            const line = existingLines[li].trim();
                            if (!line) continue;

                            // Parse the CSV row respecting quoted fields
                            const fields = [];
                            let current = '';
                            let inQuotes = false;
                            for (let ci = 0; ci < line.length; ci++) {
                                const ch = line[ci];
                                if (ch === '"') {
                                    if (inQuotes && ci + 1 < line.length && line[ci + 1] === '"') {
                                        current += '"';
                                        ci++; // skip escaped quote
                                    } else {
                                        inQuotes = !inQuotes;
                                    }
                                } else if (ch === ',' && !inQuotes) {
                                    fields.push(current);
                                    current = '';
                                } else {
                                    current += ch;
                                }
                            }
                            fields.push(current);

                            // Old format: 12 fields (no per-Q tab switches, single Tab Switches + Total Time)
                            // New format: 12 base + numQuestions Q-cols + Total Tab Switches + Total Time
                            const expectedNewCount = 12 + targetQCount + 2;
                            if (fields.length < expectedNewCount) {
                                // This is an old-format row — may not have Location or Language Preferred columns
                                const baseFields = fields.slice(0, 4); // Date,Time,Name,Email
                                let restFields = fields.slice(4);
                                // Insert empty Location if missing (old rows don't have it)
                                if (fields.length < expectedNewCount) {
                                    baseFields.push(''); // empty Location
                                }
                                baseFields.push(restFields.shift()); // Experience
                                // If old row doesn't have Language Preferred, insert empty placeholder
                                const hasLangCol = fields.length >= 12;
                                if (!hasLangCol || fields.length <= 12) {
                                    baseFields.push(''); // empty Language Preferred
                                } else {
                                    baseFields.push(restFields.shift()); // Language Preferred already present
                                }
                                // Remaining: Correct Programs ... then trailing tab switch cols + Total Tab Switches + Total Time
                                const remaining = hasLangCol ? restFields : fields.slice(5);
                                const oldTabSwitches = remaining.length > 5 ? remaining[remaining.length - 2] : '';
                                const oldTotalTime = remaining.length > 5 ? remaining[remaining.length - 1] : '';
                                const coreFields = remaining.slice(0, 5); // Correct,TestExec,Agent,AIAvg,AIMax

                                // Insert empty per-Q tab switch columns, then Total Tab Switches, then Total Time
                                const emptyQCols = new Array(targetQCount).fill('');
                                const newFields = [...baseFields, ...coreFields, ...emptyQCols, oldTabSwitches, oldTotalTime];
                                existingLines[li] = newFields.map(f => {
                                    let s = String(f).replace(/\r\n|\n|\r/g, ' ');
                                    return '"' + s.replace(/"/g, '""') + '"';
                                }).join(',');
                            }
                        }
                        consolidatedContent = existingLines.join('\n');
                    }
                }

                const testExecScore = totalPrograms > 0 ? Math.round((correctCount / totalPrograms) * 100) : 0;
                const agentScore = agentAnalysis ? agentAnalysis.averagePercentage : 0;
                const aiAvg = aiLikelihood ? aiLikelihood.average : 0;
                const aiMax = aiLikelihood ? aiLikelihood.highest : 0;

                // Per-question tab switch values
                const perQTabValues = (results || []).map(r => escapeCsvField(r.tabSwitchCount !== undefined ? r.tabSwitchCount : 0));

                // Determine how many Q columns the final header actually has, and pad if this candidate has fewer questions
                const finalHeaderLine = consolidatedContent.split('\n')[0] || conHeaders;
                const finalQCount = (finalHeaderLine.match(/Q\d+ Tab Switches/g) || []).length;
                while (perQTabValues.length < finalQCount) {
                    perQTabValues.push(escapeCsvField(0));
                }

                const totalTabSwitches = (results || []).reduce((sum, r) => sum + (r.tabSwitchCount || 0), 0);

                const langDisplay = (preferredLanguage || 'java').charAt(0).toUpperCase() + (preferredLanguage || 'java').slice(1);
                const conRow = [
                    escapeCsvField(today),
                    escapeCsvField(time),
                    escapeCsvField(personName),
                    escapeCsvField(email),
                    escapeCsvField(location || ''),
                    escapeCsvField(experienceYears),
                    escapeCsvField(langDisplay),
                    escapeCsvField(`${correctCount}/${totalPrograms}`),
                    escapeCsvField(testExecScore),
                    escapeCsvField(agentScore),
                    escapeCsvField(aiAvg),
                    escapeCsvField(aiMax),
                    ...perQTabValues,
                    escapeCsvField(totalTabSwitches),
                    escapeCsvField(formattedTime)
                ].join(',');
                consolidatedContent += conRow + '\n';
                fs.writeFileSync(consolidatedFile, consolidatedContent);

                // --- PIE CHART DATA GENERATION (date-aware, dynamic question counts) ---
                const summaryCsv = consolidatedContent.split('\n').filter(Boolean);
                const headerRow = summaryCsv[0].split(',').map(h => h.replace(/"/g, '').trim());
                const correctIdx = headerRow.findIndex(h => h.toLowerCase() === 'correct programs');
                const pieCounts = {};
                for (let i = 1; i < summaryCsv.length; ++i) {
                    const row = parseCsvRow(summaryCsv[i]);
                    const correct = (row[correctIdx] || '').replace(/"/g, '').trim();
                    if (correct) pieCounts[correct] = (pieCounts[correct] || 0) + 1;
                }
                // Build sorted labels (e.g. "2/2", "1/2", "0/2") in descending order
                const pieLabels = Object.keys(pieCounts).sort((a, b) => {
                    const [an] = a.split('/').map(Number);
                    const [bn] = b.split('/').map(Number);
                    return bn - an;
                });
                const pieValues = pieLabels.map(l => pieCounts[l]);
                const pieColors = pieLabels.map(l => {
                    const [n, t] = l.split('/').map(Number);
                    if (n === t) return '#4CAF50';      // all correct: green
                    if (n === 0) return '#F44336';       // none correct: red
                    return '#FFC107';                     // partial: orange
                });
                const pieHtml = '<div style="width: 350px; height: 350px; margin: 0 auto;">\n'
                    + '  <canvas id="allCandidatesPieChart"></canvas>\n'
                    + '</div>\n'
                    + '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n'
                    + '<script>\n'
                    + '(function() {\n'
                    + '  var ctx = document.getElementById("allCandidatesPieChart").getContext("2d");\n'
                    + '  new Chart(ctx, {\n'
                    + '    type: "pie",\n'
                    + '    data: {\n'
                    + '      labels: ' + JSON.stringify(pieLabels) + ',\n'
                    + '      datasets: [{\n'
                    + '        data: ' + JSON.stringify(pieValues) + ',\n'
                    + '        backgroundColor: ' + JSON.stringify(pieColors) + ',\n'
                    + '        borderWidth: 1\n'
                    + '      }]\n'
                    + '    },\n'
                    + '    options: {\n'
                    + '      responsive: false,\n'
                    + '      plugins: {\n'
                    + '        legend: { position: "bottom" },\n'
                    + '        tooltip: {\n'
                    + '          callbacks: {\n'
                    + '            label: function(context) {\n'
                    + '              var label = context.label || "";\n'
                    + '              var value = context.parsed;\n'
                    + '              return label + ": " + value + " candidate" + (value === 1 ? "" : "s");\n'
                    + '            }\n'
                    + '          }\n'
                    + '        }\n'
                    + '      }\n'
                    + '    }\n'
                    + '  });\n'
                    + '})();\n'
                    + '</script>\n';

                // Write date-specific pie chart HTML
                const pieFileDateSpecific = path.join(csvDir, `all-candidates-completion-pie-${today}.html`);
                fs.writeFileSync(pieFileDateSpecific, pieHtml);
                // Also write the fixed-name file as fallback
                const pieFile = path.join(csvDir, 'all-candidates-completion-pie.html');
                fs.writeFileSync(pieFile, pieHtml);

                // Write date-specific and fixed-name summary CSVs
                let completionSummaryCsv = 'Category,Count\n';
                pieLabels.forEach((label, i) => {
                    completionSummaryCsv += `Completed ${label},${pieValues[i]}\n`;
                });
                fs.writeFileSync(path.join(csvDir, `all-candidates-completion-summary-${today}.csv`), completionSummaryCsv);
                fs.writeFileSync(path.join(csvDir, 'all-candidates-completion-summary.csv'), completionSummaryCsv);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Result saved', filePath: jsonFile, csvFilePath: csvFile }));
            } catch (err) {
                console.error('Result save error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save result' }));
            }
        });
        return;
    }

    // --- Panelist: Get Daily Summary & Candidates ---
    if (pathname === '/api/panelist/daily-summary' && req.method === 'GET') {
        try {
            const date = new URL(req.url, 'http://localhost').searchParams.get('date');
            const csvDir = path.join(__dirname, '../results/csv');
            const csvFile = path.join(csvDir, `all-candidates-summary-${date}.csv`);
            const resultsDir = path.join(__dirname, '../results/json');
            
            // If CSV doesn't exist, return empty
            if (!fs.existsSync(csvFile)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    date,
                    totalCandidates: 0,
                    candidates: []
                }));
                return;
            }
            
            const content = fs.readFileSync(csvFile, 'utf-8');
            const lines = content.trim().split('\n');
            
            if (lines.length < 2) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    date,
                    totalCandidates: 0,
                    candidates: []
                }));
                return;
            }
            
            const headers = parseCsvRow(lines[0]).map(h => h.trim());
            const candidates = [];
            
            // Get all result files for this date
            const resultFiles = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir) : [];
            
            // Parse each row
            for (let i = 1; i < lines.length; i++) {
                const values = parseCsvRow(lines[i]);
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = (values[idx] || '').trim().replace(/^"|"$/g, '');
                });
                
                // Find matching result file for this candidate
                const candidateName = row['Candidate Name'] || '';
                const candidateDate = row['Date'] || date;
                let matchingFile = null;
                
                // Search for result file matching this candidate and date
                for (const file of resultFiles) {
                    if (file.includes(candidateName) && file.includes(candidateDate)) {
                        matchingFile = file.replace('.json', '');
                        break;
                    }
                }
                
                // Fallback to first matching file by candidate name and date
                if (!matchingFile) {
                    for (const file of resultFiles) {
                        const fileDate = file.match(/(\d{4})-(\d{2})-(\d{2})/);
                        if (fileDate && file.includes(candidateName) && fileDate[0] === candidateDate) {
                            matchingFile = file.replace('.json', '');
                            break;
                        }
                    }
                }
                
                // Map CSV fields to API response
                const candidate = {
                    sessionId: matchingFile || `${candidateName}-${candidateDate}`,
                    name: row['Candidate Name'] || 'Unknown',
                    email: row['Candidate Emailid'] || 'unknown@example.com',
                    location: row['Location'] || 'N/A',
                    experience: row['Relevant Experience (Years)'] || 'N/A',
                    language: row['Language Preferred'] || 'N/A',
                    correctPrograms: row['Correct Programs'] || '0/0',
                    testScore: row['Test Execution Score (%)'] || '0',
                    agentScore: row['Agent Score (%)'] || row['AI Code Review Score (%)'] || '0',
                    aiLikelihoodAvg: row['Plagiarism Avg (%)'] || row['AI Likelihood Avg (%)'] || '0',
                    aiLikelihoodMax: row['Plagiarism Max (%)'] || row['AI Likelihood Max (%)'] || '0',
                    q1TabSwitches: row['Q1 Tab Switches'] || '0',
                    q2TabSwitches: row['Q2 Tab Switches'] || '0',
                    totalTabSwitches: row['Total Tab Switches'] || '0',
                    totalTime: row['Total Time Taken'] || '0:00',
                    submittedAt: row['Date'] && row['Time'] ? `${row['Date']} ${row['Time']}` : 'N/A'
                };
                
                // Calculate overall score as average of test and agent scores
                const testScore = parseInt(candidate.testScore) || 0;
                const aiScore = parseInt(candidate.agentScore) || 0;
                candidate.score = Math.round((testScore + aiScore) / 2);
                
                candidates.push(candidate);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                date,
                totalCandidates: candidates.length,
                candidates: candidates
            }));
        } catch (error) {
            console.error('Panelist daily summary error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // --- Panelist: Get Candidate Session Details ---
    if (pathname.match(/^\/api\/panelist\/candidate-session\/[^/]+$/) && req.method === 'GET') {
        try {
            const sessionId = decodeURIComponent(pathname.split('/').pop());
            const resultsDir = path.join(__dirname, '../results/json');
            
            if (!fs.existsSync(resultsDir)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Session not found' }));
                return;
            }
            
            const files = fs.readdirSync(resultsDir);
            let sessionData = null;
            let fileName = null;
            
            for (const file of files) {
                // Match by filename (sessionId is the filename without .json)
                if (file.replace('.json', '') === sessionId) {
                    try {
                        const filePath = path.join(resultsDir, file);
                        const content = fs.readFileSync(filePath, 'utf8');
                        sessionData = JSON.parse(content);
                        fileName = file;
                        break;
                    } catch (e) {
                        // Skip invalid files
                    }
                }
            }
            
            if (!sessionData) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Session not found' }));
                return;
            }
            
            // Calculate overall score from results
            let totalScore = 0;
            let resultCount = 0;
            if (sessionData.results && Array.isArray(sessionData.results)) {
                sessionData.results.forEach(q => {
                    if (q.agentPercentage !== undefined) {
                        totalScore += q.agentPercentage;
                        resultCount++;
                    }
                });
            }
            const overallScore = resultCount > 0 ? Math.round(totalScore / resultCount) : 0;
            
            // Transform data for panelist view
            const response = {
                sessionId: sessionId,
                candidateId: sessionData.email,
                candidateName: sessionData.personName,
                candidateEmail: sessionData.email,
                experience: sessionData.experienceYears || 'N/A',
                location: sessionData.location || 'N/A',
                language: sessionData.preferredLanguage || 'N/A',
                programsCompleted: sessionData.programsCompleted || 0,
                totalPrograms: sessionData.totalPrograms || 0,
                overallScore: overallScore,
                totalTime: (() => {
                    const sec = Number(sessionData.totalTimeTaken) || 0;
                    const m = Math.floor(sec / 60);
                    const s = sec % 60;
                    return `${m}:${String(s).padStart(2, '0')}`;
                })(),
                tabSwitches: sessionData.tabSwitchCount || 0,
                completionPercentage: sessionData.programsCompleted && sessionData.totalPrograms ? 
                    Math.round((sessionData.programsCompleted / sessionData.totalPrograms) * 100) : 0,
                questions: (sessionData.results || []).map(q => {
                    let actualOut = q.actualOutput || '';
                    if (typeof actualOut === 'object') {
                        try { actualOut = JSON.stringify(actualOut); } catch(e) { actualOut = ''; }
                    }
                    return {
                        questionId: q.questionId,
                        questionTitle: q.title,
                        status: q.agentPercentage >= 75 ? 'correct' : 'incorrect',
                        agentScore: Math.round(q.agentPercentage || 0),
                        agentSuggestion: q.agentSuggestion || '',
                        agentCovered: q.agentCovered || [],
                        agentMissed: q.agentMissed || [],
                        aiLikelihood: q.aiLikelihood || 0,
                        aiReasons: q.aiReasons || [],
                        language: q.language,
                        timeTaken: q.questionTimeSpent ? Math.round(q.questionTimeSpent / 60) + ' min' : 'N/A',
                        submittedCode: q.code || '',
                        expectedOutput: q.expectedOutput || '',
                        actualOutput: actualOut
                    };
                })
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // --- Panelist: Export Daily Summary as CSV ---
    if (pathname.match(/^\/api\/panelist\/export-csv/) && req.method === 'GET') {
        try {
            const url = new URL(req.url, 'http://localhost');
            const date = url.searchParams.get('date');
            const resultsDir = path.join(__dirname, '../results/json');
            
            if (!fs.existsSync(resultsDir)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('No results found');
                return;
            }
            
            const files = fs.readdirSync(resultsDir);
            const candidates = [];
            
            files.forEach(file => {
                try {
                    const dateMatch = file.match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (!dateMatch) return;
                    
                    const fileDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                    if (fileDate === date) {
                        const filePath = path.join(resultsDir, file);
                        const content = fs.readFileSync(filePath, 'utf8');
                        const data = JSON.parse(content);
                        
                        // Calculate average score
                        let totalScore = 0, qCount = 0;
                        if (data.results && Array.isArray(data.results)) {
                            data.results.forEach(q => {
                                if (q.agentPercentage !== undefined) {
                                    totalScore += q.agentPercentage;
                                    qCount++;
                                }
                            });
                        }
                        const avgScore = qCount > 0 ? Math.round(totalScore / qCount) : 0;
                        
                        // Extract full timestamp from filename
                        const timestampMatch = file.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
                        let submittedAt = fileDate;
                        if (timestampMatch) {
                            const [, year, month, day, hours, minutes, seconds] = timestampMatch;
                            const dateObj = new Date(year, month - 1, day, hours, minutes, seconds);
                            submittedAt = dateObj.toLocaleString('en-US', {
                                month: 'numeric',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                            });
                        }
                        
                        candidates.push({
                            name: data.personName || 'Unknown',
                            email: data.email || 'unknown@example.com',
                            score: avgScore,
                            submittedAt: submittedAt
                        });
                    }
                } catch (e) {
                    // Skip invalid files
                }
            });
            
            // Generate CSV
            let csv = 'Candidate Name,Email,Score,Date & Time\n';
            candidates.forEach(c => {
                csv += `"${c.name}","${c.email}",${c.score},"${c.submittedAt}"\n`;
            });
            
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="candidates-${date}.csv"`
            });
            res.end(csv);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error generating CSV: ' + error.message);
        }
        return;
    }

    // --- Panelist: Export Daily Summary as PDF ---
    if (pathname.match(/^\/api\/panelist\/export-pdf/) && req.method === 'GET') {
        try {
            const url = new URL(req.url, 'http://localhost');
            const date = url.searchParams.get('date');
            const resultsDir = path.join(__dirname, '../results/json');
            
            if (!fs.existsSync(resultsDir)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('No results found');
                return;
            }
            
            const files = fs.readdirSync(resultsDir);
            const candidates = [];
            
            files.forEach(file => {
                try {
                    const dateMatch = file.match(/(\d{4})-(\d{2})-(\d{2})/);
                    if (!dateMatch) return;
                    
                    const fileDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                    if (fileDate === date) {
                        const filePath = path.join(resultsDir, file);
                        const content = fs.readFileSync(filePath, 'utf8');
                        const data = JSON.parse(content);
                        
                        // Calculate average score
                        let totalScore = 0, qCount = 0;
                        if (data.results && Array.isArray(data.results)) {
                            data.results.forEach(q => {
                                if (q.agentPercentage !== undefined) {
                                    totalScore += q.agentPercentage;
                                    qCount++;
                                }
                            });
                        }
                        const avgScore = qCount > 0 ? Math.round(totalScore / qCount) : 0;
                        
                        // Extract full timestamp from filename
                        const timestampMatch = file.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
                        let submittedAt = fileDate;
                        if (timestampMatch) {
                            const [, year, month, day, hours, minutes, seconds] = timestampMatch;
                            const dateObj = new Date(year, month - 1, day, hours, minutes, seconds);
                            submittedAt = dateObj.toLocaleString('en-US', {
                                month: 'numeric',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                            });
                        }
                        
                        candidates.push({
                            name: data.personName || 'Unknown',
                            email: data.email || 'unknown@example.com',
                            score: avgScore,
                            submittedAt: submittedAt
                        });
                    }
                } catch (e) {
                    // Skip invalid files
                }
            });
            
            // Generate simple HTML report (can be printed as PDF)
            let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Candidates Report - ${date}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #667eea; color: white; }
        tr:hover { background-color: #f5f5f5; }
        .score-high { color: green; font-weight: bold; }
        .score-medium { color: orange; font-weight: bold; }
        .score-low { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Candidates Report - ${date}</h1>
    <p><strong>Total Candidates:</strong> ${candidates.length}</p>
    <p><strong>Average Score:</strong> ${candidates.length > 0 ? Math.round(candidates.reduce((a, c) => a + c.score, 0) / candidates.length) : 0}%</p>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Candidate Name</th>
                <th>Email</th>
                <th>Score</th>
                <th>Date & Time</th>
            </tr>
        </thead>
        <tbody>
`;
            
            candidates.forEach((c, idx) => {
                const scoreClass = c.score >= 75 ? 'score-high' : c.score >= 50 ? 'score-medium' : 'score-low';
                html += `
            <tr>
                <td>${idx + 1}</td>
                <td>${c.name}</td>
                <td>${c.email}</td>
                <td class="${scoreClass}">${c.score}%</td>
                <td>${c.submittedAt}</td>
            </tr>
`;
            });
            
            html += `
        </tbody>
    </table>
</body>
</html>
`;
            
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Disposition': `attachment; filename="candidates-${date}.html"`
            });
            res.end(html);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error generating PDF: ' + error.message);
        }
        return;
    }

    // --- Submit Feedback (sends email from candidate to Code Evaluator) ---
    if (pathname === '/api/feedback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { candidateName, candidateEmail, feedback } = data;

                if (!candidateEmail || !feedback || !feedback.trim()) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Email and feedback are required' }));
                    return;
                }

                // Determine SMTP config — use the SMTP credentials to send the email
                const smtpConfig = getSmtpConfig(candidateEmail);
                const recipientEmail = smtpConfig.user; // Send TO the Code Evaluator (SMTP account)

                if (!smtpConfig.user || !smtpConfig.pass) {
                    console.log(`[Feedback] No SMTP credentials configured. Feedback from ${candidateEmail}: ${feedback}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Feedback recorded (email delivery not configured)' }));
                    return;
                }

                // Build the email — FROM displays as candidate, TO goes to Code Evaluator
                const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                const messageBody = [
                    `From: "${candidateName || 'Candidate'}" <${smtpConfig.user}>`,
                    `To: ${recipientEmail}`,
                    `Reply-To: ${candidateEmail}`,
                    `Subject: Candidate Feedback - ${candidateName || candidateEmail}`,
                    `MIME-Version: 1.0`,
                    `Content-Type: text/html; charset=UTF-8`,
                    ``,
                    `<html><body style="font-family:Arial,sans-serif; background:#f5f5f5; padding:20px;">`,
                    `<div style="max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.1);">`,
                    `<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); padding:24px 30px;">`,
                    `<h2 style="color:#fff; margin:0;">📬 Candidate Feedback</h2>`,
                    `</div>`,
                    `<div style="padding:28px 30px;">`,
                    `<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">`,
                    `<tr><td style="padding:8px 0; color:#888; width:140px;">Candidate Name:</td><td style="padding:8px 0; font-weight:600;">${candidateName || 'N/A'}</td></tr>`,
                    `<tr><td style="padding:8px 0; color:#888;">Candidate Email:</td><td style="padding:8px 0; font-weight:600;">${candidateEmail}</td></tr>`,
                    `<tr><td style="padding:8px 0; color:#888;">Submitted At:</td><td style="padding:8px 0;">${timestamp}</td></tr>`,
                    `</table>`,
                    `<div style="background:#f8f9ff; border-left:4px solid #667eea; padding:16px 20px; border-radius:6px; margin-top:10px;">`,
                    `<strong style="color:#333;">Feedback:</strong>`,
                    `<p style="color:#444; margin:10px 0 0 0; line-height:1.6; white-space:pre-wrap;">${feedback.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
                    `</div>`,
                    `</div>`,
                    `<div style="background:#f0f0f5; padding:14px 30px; text-align:center; font-size:12px; color:#999;">`,
                    `Code Evaluator AI Agent — Candidate Feedback System`,
                    `</div>`,
                    `</div>`,
                    `</body></html>`
                ].join('\r\n');

                // Send via SMTP (same raw socket approach as OTP)
                const emailSent = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.log(`[Feedback SMTP] Timeout sending feedback from ${candidateEmail}`);
                        try { socket.end(); } catch (e) {}
                        resolve(false);
                    }, 15000);

                    const socket = net.createConnection(smtpConfig.port, smtpConfig.host, async () => {
                        try {
                            await new Promise(r => socket.once('data', r));
                            socket.write(`EHLO localhost\r\n`);
                            await new Promise(r => socket.once('data', r));
                            socket.write(`STARTTLS\r\n`);
                            await new Promise(r => socket.once('data', r));
                            const tlsSocket = await upgradeToTLS(socket, smtpConfig.host);
                            tlsSocket.write(`EHLO localhost\r\n`);
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(`AUTH LOGIN\r\n`);
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(Buffer.from(smtpConfig.user).toString('base64') + '\r\n');
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(Buffer.from(smtpConfig.pass).toString('base64') + '\r\n');
                            const authResp = await new Promise(r => { let d=''; tlsSocket.once('data', c => { d+=c; r(d); }); });
                            if (!authResp.toString().startsWith('235')) {
                                console.log(`[Feedback SMTP] Auth failed for feedback email`);
                                tlsSocket.end();
                                clearTimeout(timeout);
                                resolve(false);
                                return;
                            }
                            tlsSocket.write(`MAIL FROM:<${smtpConfig.user}>\r\n`);
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(`RCPT TO:<${recipientEmail}>\r\n`);
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(`DATA\r\n`);
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(messageBody + '\r\n.\r\n');
                            await new Promise(r => tlsSocket.once('data', r));
                            tlsSocket.write(`QUIT\r\n`);
                            tlsSocket.end();
                            clearTimeout(timeout);
                            console.log(`✓ Feedback email sent from ${candidateEmail} (${candidateName}) to Code Evaluator`);
                            resolve(true);
                        } catch (err) {
                            clearTimeout(timeout);
                            console.error('[Feedback SMTP] Error:', err.message);
                            try { socket.end(); } catch (e) {}
                            resolve(false);
                        }
                    });

                    socket.on('error', (err) => {
                        clearTimeout(timeout);
                        console.error('[Feedback SMTP] Connection error:', err.message);
                        resolve(false);
                    });
                });

                if (emailSent) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Feedback submitted successfully' }));
                } else {
                    console.log(`[Feedback Fallback] From: ${candidateEmail}, Name: ${candidateName}, Feedback: ${feedback}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Feedback recorded (email delivery attempted)' }));
                }
            } catch (err) {
                console.error('Feedback error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to submit feedback' }));
            }
        });
        return;
    }

    // --- Performance Data ---
    if ((pathname === '/api/performance' || pathname === '/api/candidate-performance') && req.method === 'GET') {
        try {
            const name = query.name;
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Name required' }));
                return;
            }

            const csvDir = path.join(__dirname, '../results/csv');
            const csvFile = path.join(csvDir, `${name}-performance.csv`);

            if (!fs.existsSync(csvFile)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Candidate not found' }));
                return;
            }

            const content = fs.readFileSync(csvFile, 'utf-8');
            const lines = content.trim().split('\n');
            if (lines.length < 1) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, headers: [], rows: [] }));
                return;
            }

            const headers = parseCsvRow(lines[0]).map(h => h.trim());
            const rows = lines.slice(1).filter(l => l.trim()).map(line => {
                const values = parseCsvRow(line);
                const obj = {};
                headers.forEach((h, i) => obj[h] = (values[i] || '').trim());
                return obj;
            });

            const candidateName = rows.length > 0 ? (rows[0]['Candidate Name'] || name) : name;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, headers, rows, candidateName }));
        } catch (err) {
            console.error('Performance load error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load performance data' }));
        }
        return;
    }

    // --- Download CSV ---
    if (pathname === '/api/download/csv' && req.method === 'GET') {
        try {
            const name = query.name;
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Name required' }));
                return;
            }

            const csvDir = path.join(__dirname, '../results/csv');
            const csvFile = path.join(csvDir, `${name}-performance.csv`);

            if (!fs.existsSync(csvFile)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }

            const content = fs.readFileSync(csvFile, 'utf-8');
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${name}-performance.csv"`
            });
            res.end(content);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Download failed' }));
        }
        return;
    }

    // --- All Candidates Summary ---
    if (pathname === '/api/all-candidates-summary' && req.method === 'GET') {
        try {
            const date = query.date || getISTTimestamp().split('T')[0];
            const csvDir = path.join(__dirname, '../results/csv');
            const csvFile = path.join(csvDir, `all-candidates-summary-${date}.csv`);

            if (!fs.existsSync(csvFile)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Summary not found' }));
                return;
            }

            const content = fs.readFileSync(csvFile, 'utf-8');
            const lines = content.trim().split('\n');
            if (lines.length < 1) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, headers: [], rows: [] }));
                return;
            }

            const headers = parseCsvRow(lines[0]).map(h => h.trim());
            const rows = lines.slice(1).filter(l => l.trim()).map(line => {
                const values = parseCsvRow(line);
                const obj = {};
                headers.forEach((h, i) => obj[h] = (values[i] || '').trim());
                return obj;
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, headers, rows }));
        } catch (err) {
            console.error('Summary load error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load summary data' }));
        }
        return;
    }

    // --- Pie Chart Data (date-aware) ---
    if (pathname === '/api/pie-chart-data' && req.method === 'GET') {
        try {
            const date = query.date || getISTTimestamp().split('T')[0];
            const csvDir = path.join(__dirname, '../results/csv');
            const csvFile = path.join(csvDir, `all-candidates-summary-${date}.csv`);

            if (!fs.existsSync(csvFile)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, counts: {}, date }));
                return;
            }

            const content = fs.readFileSync(csvFile, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            if (lines.length < 2) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, counts: {}, date }));
                return;
            }

            // Find the "Correct Programs" column index from the header
            const headerCols = parseCsvRow(lines[0]).map(h => h.trim());
            const correctIdx = headerCols.findIndex(h => h.toLowerCase() === 'correct programs');
            if (correctIdx === -1) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, counts: {}, date }));
                return;
            }

            // Count each unique "X/Y" value
            const counts = {};
            for (let i = 1; i < lines.length; i++) {
                // Parse quoted CSV properly
                const row = parseCsvRow(lines[i]);
                const val = (row[correctIdx] || '').replace(/"/g, '').trim();
                if (val) counts[val] = (counts[val] || 0) + 1;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, counts, date }));
        } catch (err) {
            console.error('Pie chart data error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load pie chart data' }));
        }
        return;
    }

    // --- Server Logs ---
    if (pathname === '/api/logs' && req.method === 'GET') {
        try {
            const lines = url.parse(req.url, true).query.lines || 100;
            const recentLogs = logger.getRecentLogs(parseInt(lines, 10));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                logs: recentLogs,
                timestamp: new Date().toISOString()
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to retrieve logs' }));
        }
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// ==================== CSV ROW PARSER ====================
function parseCsvRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

// ==================== SERVER STARTUP ====================
server.on('close', () => {
    console.log('\u2713 Server socket closed');
});

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    (async () => {
        try {
            console.log(`\n=== Code Evaluator AI Agent ===`);
            console.log(`\u2713 Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
            console.log(`\u2713 IST Timestamp: ${getISTTimestamp()}`);
            console.log(`\n--- AI Provider Configuration ---`);
            if (USE_GEMINI) {
                if (GEMINI_API_KEY && GEMINI_API_KEY !== 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
                    console.log(`  Gemini:  \u2713 enabled (model: ${GEMINI_MODEL}, FREE tier)`);
                } else {
                    console.log(`  Gemini:  \u26A0 enabled but no API key (get free key at https://aistudio.google.com)`);
                }
            } else {
                console.log(`  Gemini:  \u2717 disabled`);
            }
            if (USE_CLAUDE) {
                if (CLAUDE_BASE_URL) {
                    console.log(`  Claude:  \u2713 LOCAL mode (model: ${CLAUDE_MODEL}, url: ${CLAUDE_BASE_URL})`);
                } else if (CLAUDE_API_KEY && CLAUDE_API_KEY !== 'sk-ant-your-key-here') {
                    console.log(`  Claude:  \u2713 CLOUD mode (model: ${CLAUDE_MODEL}, api.anthropic.com)`);
                } else {
                    console.log(`  Claude:  \u26A0 enabled but not configured (set CLAUDE_BASE_URL or CLAUDE_API_KEY)`);
                }
            } else {
                console.log(`  Claude:  \u2717 disabled`);
            }
            console.log(`  OpenAI:  ${OPENAI_API_KEY ? `\u2713 enabled (model: ${OPENAI_MODEL})` : '\u2717 disabled (no API key)'}`);
            console.log(`  Ollama:  ${USE_OLLAMA ? `\u2713 enabled (model: ${OLLAMA_MODEL}, url: ${OLLAMA_BASE_URL})` : '\u2717 disabled'}`);
            console.log(`  Fallback chain: ${[USE_GEMINI ? 'Gemini' : null, USE_CLAUDE ? 'Claude' : null, OPENAI_API_KEY ? 'OpenAI' : null, USE_OLLAMA ? 'Ollama' : null].filter(Boolean).join(' \u2192 ') || '(none configured)'}`);
            console.log(`--------------------------------\n`);

            if (USE_OLLAMA) {
                await warmupOllama();
            }

            // ==================== KEEP-ALIVE SELF-PING ====================
            // Prevents Render/Railway free tier from spinning down after inactivity
            if (process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
                const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; // 14 minutes (Render spins down at 15)
                const selfUrl = process.env.RENDER_EXTERNAL_URL
                    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
                    || `http://localhost:${PORT}`;
                setInterval(() => {
                    const pingUrl = `${selfUrl}/api/version`;
                    const mod = pingUrl.startsWith('https') ? https : http;
                    mod.get(pingUrl, (r) => {
                        r.resume();
                        console.log(`[KeepAlive] Ping ${r.statusCode}`);
                    }).on('error', (e) => {
                        console.log(`[KeepAlive] Ping failed: ${e.message}`);
                    });
                }, KEEP_ALIVE_INTERVAL);
                console.log(`\u2713 Keep-alive ping enabled (every 14 min) → ${selfUrl}`);
            }

            console.log(`\u2713 Ready for requests\n`);
        } catch (err) {
            console.error('\u2717 Error during server initialization:', err.message);
            releaseProcessLock();
            process.exit(1);
        }
    })();
});

let portBindAttempts = 0;
const MAX_PORT_RETRIES = 3;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        portBindAttempts++;
        if (portBindAttempts >= MAX_PORT_RETRIES) {
            console.error(`\n\u2717 Port ${PORT} is in use and cannot be freed after ${MAX_PORT_RETRIES} attempts. Exiting.`);
            releaseProcessLock();
            process.exit(1);
        }
        console.warn(`\n\u26A0 Port ${PORT} is in use, retry ${portBindAttempts}/${MAX_PORT_RETRIES}...`);
        setTimeout(() => {
            server.close();
            server.listen(PORT);
        }, 2000);
    } else {
        throw err;
    }
});

const clientSockets = new Set();
server.on('connection', (socket) => {
    clientSockets.add(socket);
    socket.on('close', () => {
        clientSockets.delete(socket);
    });
});

function gracefulShutdown(signal) {
    console.log(`\n\u2713 Server ${signal} - closing connections...`);

    server.close(() => {
        console.log('\u2713 Server stopped accepting new connections');
    });

    clientSockets.forEach(socket => {
        try {
            socket.destroy();
        } catch (e) {}
    });
    clientSockets.clear();

    releaseProcessLock();

    setTimeout(() => {
        console.log('\u2713 All connections closed - exiting');
        process.exit(0);
    }, 500);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
    console.error('\u2717 Uncaught Exception:', err);
    releaseProcessLock();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\u2717 Unhandled Rejection at:', promise, 'reason:', reason, 'stringified:', JSON.stringify(reason));
    if (reason && reason.stack) {
        console.error('Stack trace:', reason.stack);
    }
    releaseProcessLock();
    process.exit(1);
});

module.exports = { server };

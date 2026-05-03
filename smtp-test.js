// Standalone SMTP test — run with: node smtp-test.js
// This bypasses the entire app and tests Gmail SMTP directly with verbose logging.

const net = require('net');
const tls = require('tls');

// === CHANGE THESE TO YOUR CREDENTIALS ===
const GMAIL_USER = 'ctsqea260409@gmail.com';
const GMAIL_PASS = 'ualo cifz sohw zpsl';  // 16-char App Password (with or without spaces)
const TO_EMAIL = 'dheeraj.sai171998@gmail.com';
// =========================================

console.log('=== SMTP DIAGNOSTIC TEST ===');
console.log('Testing Gmail SMTP from your machine...\n');

function testPort465() {
    return new Promise((resolve) => {
        console.log('[Port 465] Attempting TLS connection to smtp.gmail.com:465...');
        const startTime = Date.now();

        const tlsSocket = tls.connect(465, 'smtp.gmail.com', { rejectUnauthorized: false }, () => {
            console.log(`[Port 465] ✓ TLS connection established in ${Date.now() - startTime}ms`);
        });

        let buffer = '';
        let step = 0;

        tlsSocket.on('data', (data) => {
            const text = data.toString();
            buffer += text;
            console.log(`[Port 465] <- ${text.trim().split('\r\n').join(' | ')}`);

            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const code = trimmed.substring(0, 3);
                const isFinal = /^\d{3} /.test(trimmed) || /^\d{3}$/.test(trimmed);

                if (step === 0 && code === '220') {
                    console.log('[Port 465] -> EHLO localhost');
                    tlsSocket.write('EHLO localhost\r\n');
                    step = 1;
                } else if (step === 1 && code === '250' && isFinal) {
                    console.log('[Port 465] -> AUTH LOGIN');
                    tlsSocket.write('AUTH LOGIN\r\n');
                    step = 2;
                } else if (step === 2 && code === '334') {
                    console.log('[Port 465] -> [base64 username]');
                    tlsSocket.write(Buffer.from(GMAIL_USER.trim()).toString('base64') + '\r\n');
                    step = 3;
                } else if (step === 3 && code === '334') {
                    console.log('[Port 465] -> [base64 password]');
                    tlsSocket.write(Buffer.from(GMAIL_PASS.trim()).toString('base64') + '\r\n');
                    step = 4;
                } else if (step === 4) {
                    if (code === '235') {
                        console.log('[Port 465] ✓✓✓ AUTHENTICATION SUCCESSFUL!');
                        console.log('[Port 465] -> QUIT');
                        tlsSocket.write('QUIT\r\n');
                        tlsSocket.end();
                        resolve(true);
                        return;
                    } else {
                        console.log(`[Port 465] ✗ Auth failed: ${trimmed}`);
                        tlsSocket.end();
                        resolve(false);
                        return;
                    }
                }
            }
        });

        tlsSocket.on('error', (err) => {
            console.log(`[Port 465] ✗ ERROR: ${err.code || err.message}`);
            console.log(`[Port 465] Full error: ${err.message}`);
            resolve(false);
        });

        tlsSocket.on('close', () => {
            console.log(`[Port 465] Connection closed (after ${Date.now() - startTime}ms)`);
            resolve(false);
        });

        setTimeout(() => {
            console.log('[Port 465] ✗ TIMEOUT after 20 seconds');
            tlsSocket.destroy();
            resolve(false);
        }, 20000);
    });
}

(async () => {
    const ok = await testPort465();
    console.log('\n=== RESULT ===');
    if (ok) {
        console.log('✓ SMTP port 465 works! Your credentials and network are fine.');
        console.log('  If your app still fails, the bug is in the app code.');
    } else {
        console.log('✗ SMTP port 465 failed.');
        console.log('  Check the error output above for the cause.');
    }
    process.exit(0);
})();

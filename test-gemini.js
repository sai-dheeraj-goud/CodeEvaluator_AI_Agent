const https = require('https');
const http = require('http');

const testData = {
    language: 'java',
    userCode: 'public class Test { public static void main(String[] args) { System.out.println("hello"); } }',
    questionTitle: 'Hello World',
    questionDescription: 'Write a simple hello world program',
    lastError: '',
    outputMatched: true
};

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/agent/assist',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': JSON.stringify(testData).length
    }
};

const makeRequest = (httpModule) => {
    return new Promise((resolve) => {
        const req = httpModule.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log('\n✓ SUCCESS - Gemini API Response:');
                    console.log('  Agent Used:', json.agentUsed || 'unknown');
                    console.log('  Percentage:', json.percentage ?? 'N/A');
                    console.log('  Suggestions Preview:', (json.suggestions?.[0] || 'N/A').substring(0, 150) + '...');
                    resolve(true);
                } catch (e) {
                    console.log('\n✗ Failed to parse response:', data.substring(0, 200));
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            resolve(false);
        });

        req.write(JSON.stringify(testData));
        req.end();
    });
};

(async () => {
    console.log('Testing Gemini API...\n');
    let success = await makeRequest(http);
    if (!success) {
        console.log('HTTP failed, trying HTTPS...');
        success = await makeRequest(https);
    }
    process.exit(success ? 0 : 1);
})();

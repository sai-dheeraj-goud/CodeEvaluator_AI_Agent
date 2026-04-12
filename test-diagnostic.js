const http = require('http');

const testData = {
    language: 'java',
    userCode: 'public class Test { public static void main(String[] args) { System.out.println("test"); } }',
    questionTitle: 'Simple Test',
    questionDescription: 'A simple test',
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

console.log('Sending test request to Gemini API...\n');

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Response received:');
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('Raw response:', data);
        }
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error('Request error:', e.message);
    process.exit(1);
});

req.write(JSON.stringify(testData));
req.end();

// Timeout after 15 seconds
setTimeout(() => {
    console.error('Timeout waiting for response');
    process.exit(1);
}, 15000);

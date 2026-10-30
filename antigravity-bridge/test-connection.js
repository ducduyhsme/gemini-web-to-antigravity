const https = require('https');
const http = require('http');

async function testConnection(provider, apiUrl, apiKey, modelId) {
    const isClaude = provider.toLowerCase() === 'claude' || provider.toLowerCase() === 'anthropic';
    const isHttps = apiUrl.startsWith('https://');
    const client = isHttps ? https : http;

    let targetUrl = apiUrl;
    let headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-Bridge-Test/1.0'
    };
    let body = {};

    if (isClaude) {
        if (!targetUrl.endsWith('/messages') && !targetUrl.endsWith('/messages/')) {
            if (targetUrl.endsWith('/v1')) targetUrl += '/messages';
            else if (!targetUrl.endsWith('/')) targetUrl += '/v1/messages';
        }
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
            model: modelId,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Ping' }]
        };
    } else {
        // OpenAI-Compatible
        const urlLower = targetUrl.toLowerCase();
        if (!urlLower.includes('/chat/completions') && !urlLower.includes('/completions')) {
            if (targetUrl.endsWith('/v1')) targetUrl += '/chat/completions';
            else if (!targetUrl.endsWith('/')) targetUrl += '/v1/chat/completions';
        }
        if (apiKey && apiKey !== 'none') {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        body = {
            model: modelId,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Ping' }]
        };
    }

    const payload = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(payload);

    const startTime = Date.now();

    return new Promise((resolve) => {
        try {
            const urlObj = new URL(targetUrl);
            const req = client.request(urlObj, {
                method: 'POST',
                headers: headers,
                timeout: 15000
            }, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => {
                    const elapsed = Date.now() - startTime;
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            success: true,
                            statusCode: res.statusCode,
                            elapsedMs: elapsed,
                            url: targetUrl,
                            message: `Connection successful! (HTTP ${res.statusCode}, ${elapsed}ms)`
                        });
                    } else {
                        let errMsg = resData.slice(0, 300);
                        try {
                            const parsed = JSON.parse(resData);
                            if (parsed.error && parsed.error.message) errMsg = parsed.error.message;
                        } catch {}
                        resolve({
                            success: false,
                            statusCode: res.statusCode,
                            elapsedMs: elapsed,
                            url: targetUrl,
                            message: `Provider Error (HTTP ${res.statusCode}): ${errMsg}`
                        });
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    statusCode: 408,
                    elapsedMs: Date.now() - startTime,
                    url: targetUrl,
                    message: `Timeout: Provider did not respond within 15 seconds.`
                });
            });

            req.on('error', (err) => {
                resolve({
                    success: false,
                    statusCode: 0,
                    elapsedMs: Date.now() - startTime,
                    url: targetUrl,
                    message: `Network error: ${err.message}`
                });
            });

            req.write(payload);
            req.end();
        } catch (err) {
            resolve({
                success: false,
                statusCode: 0,
                elapsedMs: 0,
                url: targetUrl,
                message: `Invalid URL error: ${err.message}`
            });
        }
    });
}

// CLI test mode
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log(JSON.stringify({
            success: false,
            message: "Usage: node test-connection.js <provider> <apiUrl> <apiKey> <modelId>"
        }));
        process.exit(1);
    }
    const [provider, apiUrl, apiKey, modelId] = args;
    testConnection(provider, apiUrl, apiKey, modelId).then(res => {
        console.log(JSON.stringify(res, null, 2));
    });
}

module.exports = { testConnection };

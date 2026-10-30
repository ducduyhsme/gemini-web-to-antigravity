const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const net = require('net');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 49000;
const BRIDGE_PORT = 50998;

const ACCOUNTS_DIR = path.join(ROOT_DIR, 'accounts');
const INSTANCES_DIR = path.join(ROOT_DIR, 'instances');
const ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'accounts.json');
const BINARY_PATH = path.join(ROOT_DIR, 'gemini-web-to-api.exe');
const BRIDGE_DIR = path.join(ROOT_DIR, 'antigravity-bridge');
const BRIDGE_SERVER = path.join(BRIDGE_DIR, 'server.js');
const SAVED_MODELS_FILE = path.join(BRIDGE_DIR, 'saved_models.json');
const IDE_SETTINGS_PATH = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Antigravity IDE', 'User', 'settings.json');

// Ensure directories exist
if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
if (!fs.existsSync(INSTANCES_DIR)) fs.mkdirSync(INSTANCES_DIR, { recursive: true });

// --- Unified Log Hub ---
class LogHub {
    constructor(maxSize = 2000) {
        this.maxSize = maxSize;
        this.logs = [];
        this.clients = new Set();
    }

    push(entry) {
        const item = {
            id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            source: entry.source || 'System',
            level: entry.level || 'info', // 'info', 'warn', 'error', 'success'
            text: entry.text || ''
        };

        // Split multiple lines if present
        const lines = item.text.split(/\r?\n/).filter(l => l.trim().length > 0);
        for (const line of lines) {
            const single = { ...item, text: line };
            this.logs.push(single);
            if (this.logs.length > this.maxSize) {
                this.logs.shift();
            }
            this.broadcast(single);
        }
    }

    broadcast(item) {
        const payload = `data: ${JSON.stringify(item)}\n\n`;
        for (const res of this.clients) {
            try {
                res.write(payload);
            } catch {
                this.clients.delete(res);
            }
        }
    }

    addClient(res) {
        this.clients.add(res);
        res.on('close', () => this.clients.delete(res));
    }

    clear() {
        this.logs = [];
        this.push({ source: 'System', level: 'info', text: 'Logs cleared.' });
    }
}

const logHub = new LogHub();

// --- Process Manager ---
const runningProcesses = new Map(); // key -> { process, port, name, startTime }

function testPort(port, timeoutMs = 500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;
        socket.setTimeout(timeoutMs);
        socket.on('connect', () => {
            status = true;
            socket.destroy();
        });
        socket.on('timeout', () => socket.destroy());
        socket.on('error', () => socket.destroy());
        socket.on('close', () => resolve(status));
        socket.connect(port, '127.0.0.1');
    });
}

function killPortProcess(port) {
    try {
        const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const lines = out.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (/^\d+$/.test(pid) && parseInt(pid, 10) > 0) {
                try {
                    process.kill(parseInt(pid, 10), 'SIGKILL');
                } catch {
                    try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
                }
            }
        }
    } catch {}
}

// --- Accounts Operations ---
function getAccounts() {
    if (fs.existsSync(ACCOUNTS_FILE)) {
        try {
            let content = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
            return JSON.parse(content);
        } catch {
            return [];
        }
    }
    return [];
}

function saveAccounts(accounts) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
}

async function startAccountInstance(account) {
    const isPortBusy = await testPort(account.port);
    if (isPortBusy && !runningProcesses.has(account.id)) {
        logHub.push({ source: account.name, level: 'warn', text: `Port ${account.port} is already in use by another process.` });
        return { success: false, message: `Port ${account.port} is already busy.` };
    }

    const instDir = path.join(INSTANCES_DIR, account.id);
    if (!fs.existsSync(instDir)) fs.mkdirSync(instDir, { recursive: true });

    // Sync env file into instance
    const accEnv = path.join(ACCOUNTS_DIR, `${account.id}.env`);
    const instEnv = path.join(instDir, '.env');
    if (fs.existsSync(accEnv)) {
        fs.copyFileSync(accEnv, instEnv);
    }

    logHub.push({ source: account.name, level: 'info', text: `Starting instance on port ${account.port}...` });

    try {
        const child = spawn(BINARY_PATH, [], {
            cwd: instDir,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout.on('data', chunk => {
            logHub.push({ source: account.name, level: 'info', text: chunk.toString() });
        });

        child.stderr.on('data', chunk => {
            logHub.push({ source: account.name, level: 'warn', text: chunk.toString() });
        });

        child.on('close', code => {
            logHub.push({ source: account.name, level: code === 0 ? 'info' : 'warn', text: `Process stopped (Exit code: ${code})` });
            runningProcesses.delete(account.id);
        });

        child.on('error', err => {
            logHub.push({ source: account.name, level: 'error', text: `Process error: ${err.message}` });
            runningProcesses.delete(account.id);
        });

        runningProcesses.set(account.id, {
            process: child,
            port: account.port,
            name: account.name,
            startTime: Date.now()
        });

        // Wait up to 3 seconds for port to open
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (await testPort(account.port)) {
                logHub.push({ source: account.name, level: 'success', text: `Server is active and listening on port ${account.port}!` });
                return { success: true, port: account.port };
            }
        }

        return { success: true, port: account.port };
    } catch (e) {
        logHub.push({ source: account.name, level: 'error', text: `Failed to launch: ${e.message}` });
        return { success: false, message: e.message };
    }
}

async function stopAccountInstance(account) {
    logHub.push({ source: account.name, level: 'info', text: `Stopping instance...` });
    const item = runningProcesses.get(account.id);
    if (item && item.process) {
        try {
            item.process.kill('SIGTERM');
        } catch {}
    }
    runningProcesses.delete(account.id);
    killPortProcess(account.port);

    await new Promise(r => setTimeout(r, 300));
    logHub.push({ source: account.name, level: 'info', text: `Instance stopped.` });
    return { success: true };
}

// --- Bridge Operations ---
async function startBridgeServer() {
    if (await testPort(BRIDGE_PORT)) {
        logHub.push({ source: 'Antigravity Bridge', level: 'info', text: `Bridge server is already running on port ${BRIDGE_PORT}.` });
        return { success: true, port: BRIDGE_PORT };
    }

    logHub.push({ source: 'Antigravity Bridge', level: 'info', text: `Starting Antigravity Bridge Proxy on port ${BRIDGE_PORT}...` });

    try {
        const child = spawn(process.execPath, [BRIDGE_SERVER], {
            cwd: BRIDGE_DIR,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout.on('data', chunk => {
            logHub.push({ source: 'Bridge Proxy', level: 'info', text: chunk.toString() });
        });

        child.stderr.on('data', chunk => {
            logHub.push({ source: 'Bridge Proxy', level: 'warn', text: chunk.toString() });
        });

        child.on('close', code => {
            logHub.push({ source: 'Bridge Proxy', level: 'info', text: `Bridge process stopped (Exit code: ${code})` });
            runningProcesses.delete('bridge');
        });

        child.on('error', err => {
            logHub.push({ source: 'Bridge Proxy', level: 'error', text: `Bridge process error: ${err.message}` });
            runningProcesses.delete('bridge');
        });

        runningProcesses.set('bridge', {
            process: child,
            port: BRIDGE_PORT,
            name: 'Bridge Proxy',
            startTime: Date.now()
        });

        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (await testPort(BRIDGE_PORT)) {
                logHub.push({ source: 'Bridge Proxy', level: 'success', text: `Bridge Proxy is active and listening on port ${BRIDGE_PORT}!` });
                return { success: true, port: BRIDGE_PORT };
            }
        }

        return { success: true, port: BRIDGE_PORT };
    } catch (e) {
        logHub.push({ source: 'Bridge Proxy', level: 'error', text: `Failed to launch Bridge: ${e.message}` });
        return { success: false, message: e.message };
    }
}

async function stopBridgeServer() {
    logHub.push({ source: 'Bridge Proxy', level: 'info', text: `Stopping Bridge server...` });
    const item = runningProcesses.get('bridge');
    if (item && item.process) {
        try {
            item.process.kill('SIGTERM');
        } catch {}
    }
    runningProcesses.delete('bridge');
    killPortProcess(BRIDGE_PORT);

    const pidFile = path.join(BRIDGE_DIR, 'bridge.pid');
    if (fs.existsSync(pidFile)) {
        try { fs.unlinkSync(pidFile); } catch {}
    }

    await new Promise(r => setTimeout(r, 300));
    logHub.push({ source: 'Bridge Proxy', level: 'info', text: `Bridge server stopped.` });
    return { success: true };
}

// --- Antigravity IDE Settings ---
function getIdeStatus() {
    if (fs.existsSync(IDE_SETTINGS_PATH)) {
        try {
            const settings = JSON.parse(fs.readFileSync(IDE_SETTINGS_PATH, 'utf8'));
            if (settings['jetski.cloudCodeUrl'] && settings['jetski.cloudCodeUrl'].includes(BRIDGE_PORT.toString())) {
                return true;
            }
        } catch {}
    }
    return false;
}

function setIdeStatus(enable) {
    const dir = path.dirname(IDE_SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let settings = {};
    if (fs.existsSync(IDE_SETTINGS_PATH)) {
        try {
            settings = JSON.parse(fs.readFileSync(IDE_SETTINGS_PATH, 'utf8'));
        } catch {
            settings = {};
        }
    }

    if (enable) {
        settings['jetski.cloudCodeUrl'] = `http://127.0.0.1:${BRIDGE_PORT}`;
        logHub.push({ source: 'IDE Settings', level: 'success', text: `Antigravity IDE configured to route through Bridge (http://127.0.0.1:${BRIDGE_PORT}).` });
    } else {
        delete settings['jetski.cloudCodeUrl'];
        logHub.push({ source: 'IDE Settings', level: 'info', text: `Antigravity IDE restored to official Google Gemini backend.` });
    }

    fs.writeFileSync(IDE_SETTINGS_PATH, JSON.stringify(settings, null, 4), 'utf8');
    return { success: true, active: enable };
}

// --- Custom Models & History ---
const configModule = require(path.join(BRIDGE_DIR, 'dist', 'config.js'));

function getCustomModels() {
    try {
        return configModule.listModels();
    } catch {
        return [];
    }
}

function getSavedModelIds(provider) {
    if (fs.existsSync(SAVED_MODELS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(SAVED_MODELS_FILE, 'utf8'));
            const key = provider && (provider.toLowerCase().includes('claude') || provider.toLowerCase().includes('anthropic')) ? 'claude' : 'openai';
            return data[key] || [];
        } catch {}
    }
    return [];
}

function addSavedModelId(provider, modelId) {
    let data = { openai: [], claude: [] };
    if (fs.existsSync(SAVED_MODELS_FILE)) {
        try { data = JSON.parse(fs.readFileSync(SAVED_MODELS_FILE, 'utf8')); } catch {}
    }
    const key = provider && (provider.toLowerCase().includes('claude') || provider.toLowerCase().includes('anthropic')) ? 'claude' : 'openai';
    if (!data[key]) data[key] = [];
    if (!data[key].includes(modelId)) {
        data[key].push(modelId);
        fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
}

function removeSavedModelId(provider, modelId) {
    if (fs.existsSync(SAVED_MODELS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(SAVED_MODELS_FILE, 'utf8'));
            const key = provider && (provider.toLowerCase().includes('claude') || provider.toLowerCase().includes('anthropic')) ? 'claude' : 'openai';
            if (data[key]) {
                data[key] = data[key].filter(m => m !== modelId);
                fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify(data, null, 2), 'utf8');
            }
        } catch {}
    }
}

function addCustomModel(payload) {
    let apiUrl = (payload.apiUrl || '').trim();
    const isClaude = payload.provider === 'anthropic';
    const cleanBase = apiUrl.replace(/\/+$/, '');
    const isLocalGemini = cleanBase.includes(':498');

    // Smart URL Normalization
    if (isClaude) {
        if (!apiUrl.endsWith('/messages')) {
            if (isLocalGemini && !cleanBase.includes('/claude')) {
                apiUrl = `${cleanBase}/claude/v1/messages`;
            } else if (cleanBase.endsWith('/v1')) {
                apiUrl = `${cleanBase}/messages`;
            } else {
                apiUrl = `${cleanBase}/v1/messages`;
            }
        }
    } else {
        if (!apiUrl.endsWith('/chat/completions')) {
            if (isLocalGemini && !cleanBase.includes('/openai')) {
                apiUrl = `${cleanBase}/openai/v1/chat/completions`;
            } else if (cleanBase.endsWith('/v1')) {
                apiUrl = `${cleanBase}/chat/completions`;
            } else {
                apiUrl = `${cleanBase}/v1/chat/completions`;
            }
        }
    }

    const slug = 'custom-' + (payload.externalModelName || payload.name || 'model')
        .replace(/^models\//, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    const newModel = {
        name: slug,
        displayName: payload.displayName || payload.externalModelName || slug,
        description: payload.description || `Custom ${payload.provider} model for Antigravity`,
        provider: payload.provider,
        externalModelName: payload.externalModelName,
        apiKey: payload.apiKey,
        apiUrl: apiUrl,
        allowUnauthorized: payload.allowUnauthorized || false
    };

    configModule.addModel(newModel);
    addSavedModelId(payload.provider, payload.externalModelName);
    logHub.push({ source: 'Custom Models', level: 'success', text: `Added custom model: ${newModel.displayName} (${newModel.externalModelName})` });
    return { success: true, model: newModel };
}

function removeCustomModel(name) {
    configModule.removeModel(name);
    logHub.push({ source: 'Custom Models', level: 'info', text: `Removed custom model: ${name}` });
    return { success: true };
}

// --- Test Connections ---
async function testEndpoint(provider, apiUrl, apiKey, modelId) {
    const isClaude = provider.toLowerCase().includes('claude') || provider.toLowerCase().includes('anthropic');
    const url = new URL(apiUrl);
    const client = url.protocol === 'https:' ? require('https') : require('http');

    let postData;
    let headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-Connection-Tester/1.0'
    };

    if (isClaude) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        postData = JSON.stringify({
            model: modelId,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Ping' }]
        });
    } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
        postData = JSON.stringify({
            model: modelId,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Ping' }]
        });
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
        const req = client.request(url, { method: 'POST', headers, timeout: 10000 }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const latency = Date.now() - startTime;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, latency, message: `Connected successfully! HTTP ${res.statusCode} (${latency}ms)` });
                } else {
                    resolve({ success: false, latency, message: `HTTP ${res.statusCode}: ${body.substring(0, 150)}` });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, message: 'Connection timed out after 10s.' });
        });

        req.on('error', (err) => {
            resolve({ success: false, message: `Connection failed: ${err.message}` });
        });

        req.write(postData);
        req.end();
    });
}

// --- HTTP Server & Static Handler ---
function serveStatic(res, filePath, contentType) {
    if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
    }
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = parsedUrl.pathname;

    // --- API ROUTES ---
    if (pathname === '/api/status') {
        const accounts = getAccounts();
        const accountsStatus = [];
        for (const a of accounts) {
            const isRunning = await testPort(a.port);
            accountsStatus.push({ ...a, running: isRunning });
        }
        const bridgeRunning = await testPort(BRIDGE_PORT);
        const ideActive = getIdeStatus();
        const customModels = getCustomModels();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            accounts: accountsStatus,
            bridge: { running: bridgeRunning, port: BRIDGE_PORT },
            ide: { active: ideActive, port: BRIDGE_PORT },
            modelsCount: customModels.length
        }));
        return;
    }

    if (pathname === '/api/accounts') {
        const accounts = getAccounts();
        const results = [];
        for (const a of accounts) {
            const isRunning = await testPort(a.port);
            results.push({ ...a, running: isRunning });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
        return;
    }

    if (pathname === '/api/accounts/start' && req.method === 'POST') {
        const { id } = await parseJsonBody(req);
        const accounts = getAccounts();
        const target = accounts.find(a => a.id === id);
        if (!target) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Account not found' }));
            return;
        }
        const result = await startAccountInstance(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    if (pathname === '/api/accounts/stop' && req.method === 'POST') {
        const { id } = await parseJsonBody(req);
        const accounts = getAccounts();
        const target = accounts.find(a => a.id === id);
        if (!target) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Account not found' }));
            return;
        }
        const result = await stopAccountInstance(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    if (pathname === '/api/accounts/start-all' && req.method === 'POST') {
        const accounts = getAccounts();
        logHub.push({ source: 'System', level: 'info', text: `Starting all ${accounts.length} account instances...` });
        for (const a of accounts) {
            await startAccountInstance(a);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: accounts.length }));
        return;
    }

    if (pathname === '/api/accounts/stop-all' && req.method === 'POST') {
        const accounts = getAccounts();
        logHub.push({ source: 'System', level: 'info', text: `Stopping all account instances...` });
        for (const a of accounts) {
            await stopAccountInstance(a);
        }
        // Force kill any remaining binary processes
        try { execSync('taskkill /F /IM gemini-web-to-api.exe', { stdio: 'ignore' }); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    if (pathname === '/api/accounts/add' && req.method === 'POST') {
        const { name, cookie, authUser, port } = await parseJsonBody(req);
        if (!name || !cookie) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Name and Cookie are required.' }));
            return;
        }

        const accounts = getAccounts();
        let targetPort = parseInt(port, 10);
        if (!targetPort || isNaN(targetPort)) {
            targetPort = 4981;
            const used = accounts.map(a => a.port);
            while (used.includes(targetPort)) targetPort++;
        }

        const accId = 'acc_' + Date.now();
        const newAcc = {
            id: accId,
            name: name.trim(),
            authUser: (authUser || '').trim(),
            port: targetPort,
            createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        const envContent = `# Configuration for ${newAcc.name}\nPORT=${newAcc.port}\nGEMINI_COOKIES=${cookie.trim()}\nGEMINI_AUTH_USER=${newAcc.authUser}\nGEMINI_REFRESH_INTERVAL=1440\nGEMINI_MAX_RETRIES=3\nGEMINI_TEMPORARY=false\nAPP_ENV=production\nRATE_LIMIT_ENABLED=true\nRATE_LIMIT_WINDOW_MS=60000\nRATE_LIMIT_MAX_REQUESTS=30\n`;
        fs.writeFileSync(path.join(ACCOUNTS_DIR, `${accId}.env`), envContent, 'utf8');

        const instDir = path.join(INSTANCES_DIR, accId);
        if (!fs.existsSync(instDir)) fs.mkdirSync(instDir, { recursive: true });
        fs.writeFileSync(path.join(instDir, '.env'), envContent, 'utf8');

        accounts.push(newAcc);
        saveAccounts(accounts);

        logHub.push({ source: 'Accounts', level: 'success', text: `Added account '${newAcc.name}' on port ${newAcc.port}.` });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, account: newAcc }));
        return;
    }

    if (pathname === '/api/accounts/update-cookie' && req.method === 'POST') {
        const { id, cookie } = await parseJsonBody(req);
        const accounts = getAccounts();
        const target = accounts.find(a => a.id === id);
        if (!target || !cookie) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Account or Cookie not found.' }));
            return;
        }

        const accEnv = path.join(ACCOUNTS_DIR, `${id}.env`);
        if (fs.existsSync(accEnv)) {
            let content = fs.readFileSync(accEnv, 'utf8');
            content = content.replace(/^GEMINI_COOKIES=.*$/m, `GEMINI_COOKIES=${cookie.trim()}`);
            fs.writeFileSync(accEnv, content, 'utf8');

            const instEnv = path.join(INSTANCES_DIR, id, '.env');
            if (fs.existsSync(instEnv)) {
                fs.writeFileSync(instEnv, content, 'utf8');
            }
            logHub.push({ source: target.name, level: 'success', text: `Cookie updated successfully.` });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    if (pathname === '/api/accounts/delete' && req.method === 'POST') {
        const { id } = await parseJsonBody(req);
        let accounts = getAccounts();
        const target = accounts.find(a => a.id === id);
        if (target) {
            await stopAccountInstance(target);
            accounts = accounts.filter(a => a.id !== id);
            saveAccounts(accounts);

            const accEnv = path.join(ACCOUNTS_DIR, `${id}.env`);
            if (fs.existsSync(accEnv)) try { fs.unlinkSync(accEnv); } catch {}

            const instDir = path.join(INSTANCES_DIR, id);
            if (fs.existsSync(instDir)) try { fs.rmSync(instDir, { recursive: true, force: true }); } catch {}

            logHub.push({ source: 'Accounts', level: 'info', text: `Deleted account '${target.name}'.` });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // --- BRIDGE ROUTES ---
    if (pathname === '/api/bridge/start' && req.method === 'POST') {
        const resObj = await startBridgeServer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resObj));
        return;
    }

    if (pathname === '/api/bridge/stop' && req.method === 'POST') {
        const resObj = await stopBridgeServer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resObj));
        return;
    }

    // --- IDE ROUTES ---
    if (pathname === '/api/ide/toggle' && req.method === 'POST') {
        const { enable } = await parseJsonBody(req);
        const resObj = setIdeStatus(!!enable);
        if (enable && !(await testPort(BRIDGE_PORT))) {
            await startBridgeServer();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resObj));
        return;
    }

    // --- MODELS ROUTES ---
    if (pathname === '/api/models' && req.method === 'GET') {
        const models = getCustomModels();
        const savedOpenai = getSavedModelIds('openai');
        const savedClaude = getSavedModelIds('claude');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models, saved: { openai: savedOpenai, claude: savedClaude } }));
        return;
    }

    if (pathname === '/api/models/add' && req.method === 'POST') {
        const payload = await parseJsonBody(req);
        const resObj = addCustomModel(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resObj));
        return;
    }

    if (pathname === '/api/models/delete' && req.method === 'POST') {
        const { name } = await parseJsonBody(req);
        const resObj = removeCustomModel(name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resObj));
        return;
    }

    if (pathname === '/api/models/test' && req.method === 'POST') {
        const { provider, apiUrl, apiKey, modelId } = await parseJsonBody(req);
        const resObj = await testEndpoint(provider, apiUrl, apiKey, modelId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resObj));
        return;
    }

    // --- LOGS STREAM ---
    if (pathname === '/api/logs/stream') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        // Send initial backlog
        for (const item of logHub.logs) {
            res.write(`data: ${JSON.stringify(item)}\n\n`);
        }
        logHub.addClient(res);
        return;
    }

    if (pathname === '/api/logs/clear' && req.method === 'POST') {
        logHub.clear();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // --- STATIC FILES ---
    let localPath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
        const ext = path.extname(localPath).toLowerCase();
        const types = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json',
            '.png': 'image/png',
            '.svg': 'image/svg+xml'
        };
        serveStatic(res, localPath, types[ext] || 'application/octet-stream');
        return;
    }

    // Fallback to index.html
    const indexPath = path.join(__dirname, 'public', 'index.html');
    serveStatic(res, indexPath, 'text/html; charset=utf-8');
});

server.listen(PORT, '127.0.0.1', () => {
    logHub.push({ source: 'System', level: 'info', text: `GUI Management Server running at http://127.0.0.1:${PORT}` });
    console.log(`[GUI_SERVER_READY] http://127.0.0.1:${PORT}`);
});

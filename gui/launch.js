const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');

const PORT = 49000;
const SERVER_SCRIPT = path.join(__dirname, 'server.js');

function testPort(port, timeoutMs = 400) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;
        socket.setTimeout(timeoutMs);
        socket.on('connect', () => { status = true; socket.destroy(); });
        socket.on('timeout', () => socket.destroy());
        socket.on('error', () => socket.destroy());
        socket.on('close', () => resolve(status));
        socket.connect(port, '127.0.0.1');
    });
}

function findBrowser() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe')
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function main() {
    // 1. Check if server already running
    const isRunning = await testPort(PORT);
    if (!isRunning) {
        // Spawn server in background completely detached & hidden
        const serverProc = spawn(process.execPath, [SERVER_SCRIPT], {
            cwd: path.resolve(__dirname, '..'),
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
        });
        serverProc.unref();

        // Wait up to 5 seconds for port to open
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (await testPort(PORT)) break;
        }
    }

    // 2. Launch GUI window in App mode (Native standalone window)
    const url = `http://127.0.0.1:${PORT}`;
    const browserPath = findBrowser();
    const tempProfile = path.join(os.tmpdir(), 'gemini_api_gui_profile');

    if (browserPath) {
        const args = [
            `--app=${url}`,
            `--window-size=1180,800`,
            `--user-data-dir=${tempProfile}`,
            '--no-first-run',
            '--no-default-browser-check'
        ];
        const guiProc = spawn(browserPath, args, {
            detached: true,
            windowsHide: false,
            stdio: 'ignore'
        });
        guiProc.unref();
    } else {
        // Fallback: open default system browser
        exec(`start ${url}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Launch failed:', err);
    process.exit(1);
});

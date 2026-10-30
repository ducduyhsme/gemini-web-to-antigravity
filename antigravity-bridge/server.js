const fs = require('fs');
const path = require('path');
const proxy = require('./dist/proxy.js');

const port = parseInt(process.env.PORT || '50998', 10);
const pidFile = path.join(__dirname, 'bridge.pid');

fs.writeFileSync(pidFile, process.pid.toString(), 'utf8');

console.log(`[ANTIGRAVITY_BRIDGE] Starting proxy on 127.0.0.1:${port} (PID: ${process.pid})...`);

function cleanup() {
    try {
        if (fs.existsSync(pidFile)) {
            fs.unlinkSync(pidFile);
        }
    } catch {}
}

proxy.startProxy(port).then((actualPort) => {
    console.log(`[ANTIGRAVITY_BRIDGE_READY] Running on port ${actualPort}`);
    
    process.on('SIGINT', async () => {
        console.log('\n[ANTIGRAVITY_BRIDGE] Stopping proxy...');
        cleanup();
        await proxy.stopProxy();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        console.log('\n[ANTIGRAVITY_BRIDGE] Stopping proxy...');
        cleanup();
        await proxy.stopProxy();
        process.exit(0);
    });
    process.on('exit', () => {
        cleanup();
    });
}).catch((err) => {
    console.error(`[ANTIGRAVITY_BRIDGE_ERROR] Failed to start proxy:`, err.message);
    cleanup();
    process.exit(1);
});

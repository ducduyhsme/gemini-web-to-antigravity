"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchWithRollback = patchWithRollback;
/**
 * Patch rollback utilities.
 * Applies the agy binary patch, verifies the proxy works, and rolls back on failure.
 */
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const crypto_1 = require("./crypto");
const proxy_1 = require("./proxy");
function getAgyVersion(binPath) {
    try {
        const out = (0, child_process_1.execSync)(`"${binPath}" --version`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
        const m = out.match(/(\d+\.\d+\.?\d*)/);
        return m ? m[1] : null;
    }
    catch {
        return null;
    }
}
async function testProxyConnection(port) {
    return new Promise((resolve) => {
        const req = require('http').request({
            hostname: '127.0.0.1',
            port,
            path: '/health',
            method: 'GET',
            timeout: 5000,
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
    });
}
async function findLatestBackup(binPath) {
    const dir = require('path').dirname(binPath);
    const base = require('path').basename(binPath);
    try {
        const files = fs.readdirSync(dir);
        const backups = files
            .filter((f) => f.startsWith(base + '.bak-'))
            .map((f) => require('path').join(dir, f))
            .filter((p) => fs.existsSync(p))
            .sort((a, b) => {
            const statA = fs.statSync(a);
            const statB = fs.statSync(b);
            return statB.mtime.getTime() - statA.mtime.getTime();
        });
        return backups[0] || null;
    }
    catch {
        return null;
    }
}
async function patchWithRollback(binPath, patchFn) {
    const version = getAgyVersion(binPath);
    const backup = (0, crypto_1.backupFile)(binPath, version || undefined);
    try {
        patchFn(binPath);
        const port = await (0, proxy_1.startProxy)();
        const ok = await testProxyConnection(port);
        if (!ok) {
            throw new Error('Proxy health check failed after patch');
        }
        console.log('[ok] Patch applied and verified successfully.');
        return true;
    }
    catch (e) {
        console.error('[Error] Patch verification failed, rolling back...');
        // Attempt to restore from the backup we just created
        if (backup && fs.existsSync(backup)) {
            try {
                fs.copyFileSync(backup, binPath);
                console.log('[ok] Rolled back to backup:', backup);
            }
            catch (restoreErr) {
                console.error('[Error] Failed to restore from backup:', restoreErr);
            }
        }
        else {
            // Fallback: try to find the most recent backup
            const latest = await findLatestBackup(binPath);
            if (latest) {
                try {
                    fs.copyFileSync(latest, binPath);
                    console.log('[ok] Rolled back to latest backup:', latest);
                }
                catch (restoreErr) {
                    console.error('[Error] Failed to restore from latest backup:', restoreErr);
                }
            }
            else {
                console.error('[Error] No backup found. Manual restore may be required.');
            }
        }
        await (0, proxy_1.stopProxy)();
        return false;
    }
}
//# sourceMappingURL=rollback.js.map
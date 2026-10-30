#!/usr/bin/env node
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Free Antigravity CLI - Community Edition
 * Wraps the official agy CLI with custom model support via a local proxy.
 */
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const inquirer_1 = __importDefault(require("inquirer"));
const config_1 = require("./config");
const proxy_1 = require("./proxy");
const crypto_1 = require("./crypto");
const manifest_1 = require("./manifest");
function searchInPath() {
    try {
        const cmd = os.platform() === 'win32' ? 'where agy' : 'which agy';
        const out = (0, child_process_1.execSync)(cmd, { stdio: 'pipe' }).toString().trim().split('\r\n')[0].split('\n')[0];
        if (out && fs.existsSync(out))
            return out;
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            console.debug('[Debug] searchInPath failed:', e.message);
        }
    }
    return null;
}
function getAgyBin() {
    // 1. User Override
    if (process.env.AGY_BIN && fs.existsSync(process.env.AGY_BIN)) {
        return process.env.AGY_BIN;
    }
    // 2. PATH Search
    const pathBin = searchInPath();
    if (pathBin)
        return pathBin;
    // 3. OS-specific defaults
    const isWin = os.platform() === 'win32';
    const binName = isWin ? 'agy.exe' : 'agy';
    const locations = [
        // Windows default
        path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', binName),
        // macOS default Application Support
        path.join(os.homedir(), 'Library', 'Application Support', 'agy', 'bin', binName),
        // macOS/Linux local share
        path.join(os.homedir(), '.local', 'share', 'agy', 'bin', binName),
        // macOS/Linux local bin fallback
        path.join(os.homedir(), '.local', 'bin', binName),
    ];
    for (const loc of locations) {
        if (fs.existsSync(loc))
            return loc;
    }
    // 4. Default fallback based on platform
    if (isWin) {
        return path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
    }
    return path.join(os.homedir(), '.local', 'share', 'agy', 'bin', 'agy');
}
async function ensureProxy() {
    try {
        return await (0, proxy_1.startProxy)();
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            console.warn('[Warn] startProxy failed, using cached port:', e.message);
        }
        return (0, proxy_1.getProxyPort)() || 50998;
    }
}
function getVersion() {
    try {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return pkg.version || '1.0.4';
        }
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            console.debug('[Debug] getVersion failed:', e.message);
        }
    }
    return '1.0.4';
}
function patchUrlFlexible(buf, original, replacement) {
    const origBuf = Buffer.from(original);
    const idx = buf.indexOf(origBuf);
    if (idx === -1)
        return false;
    const replBuf = Buffer.from(replacement);
    const paddedRepl = Buffer.alloc(origBuf.length);
    replBuf.copy(paddedRepl);
    // Pad remaining bytes with null (safe inside binary strings)
    for (let i = replBuf.length; i < paddedRepl.length; i++)
        paddedRepl[i] = 0;
    paddedRepl.copy(buf, idx);
    return true;
}
function discoverGoogleUrls(buf) {
    const found = new Set();
    const str = buf.toString('ascii');
    const urlPattern = /https:\/\/[a-z0-9-]+\.googleapis\.com/g;
    let match;
    while ((match = urlPattern.exec(str)) !== null) {
        found.add(match[0]);
    }
    return Array.from(found);
}
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
function ensureAgyPatched(binPath) {
    if (!fs.existsSync(binPath))
        return;
    try {
        const version = getAgyVersion(binPath);
        const buf = fs.readFileSync(binPath);
        const port = (0, proxy_1.getProxyPort)() || 50998;
        const replBase = `http://localhost:${port}/v1internal/`;
        // Known targets for backwards compatibility
        const knownTargets = [
            { orig: 'https://daily-cloudcode-pa.googleapis.com', repl: replBase + 'xxxxxxx' },
            { orig: 'https://cloudcode-pa.googleapis.com', repl: replBase + 'x' },
        ];
        // Discover additional Google URLs dynamically from the binary
        const discovered = discoverGoogleUrls(buf);
        const dynamicTargets = discovered
            .filter((url) => !knownTargets.some((k) => k.orig === url))
            .map((url) => ({ orig: url, repl: replBase + 'x' }));
        const allTargets = [...knownTargets, ...dynamicTargets];
        // Check if already fully patched
        if (allTargets.every((t) => buf.includes(Buffer.from(t.repl))))
            return;
        // Check for old patches to upgrade (50999 → current port)
        const oldPatches = [
            { old: 'http://localhost:50999/v1internal/xxxxxxx', newP: replBase + 'xxxxxxx' },
        ];
        let upgraded = false;
        for (const op of oldPatches) {
            const oldBuf = Buffer.from(op.old);
            const newBuf = Buffer.from(op.newP);
            const oi = buf.indexOf(oldBuf);
            if (oi !== -1 && newBuf.length === oldBuf.length) {
                (0, crypto_1.backupFile)(binPath, version || undefined);
                newBuf.copy(buf, oi);
                upgraded = true;
            }
        }
        if (upgraded)
            console.log('[ok] agy binary patch upgraded (50999 → current port).');
        // Apply fresh patches (flexible, handles length mismatches via padding)
        let patched = false;
        for (const t of allTargets) {
            if (buf.includes(Buffer.from(t.repl)))
                continue;
            if (patchUrlFlexible(buf, t.orig, t.repl))
                patched = true;
        }
        if (patched || upgraded) {
            if (!upgraded)
                (0, crypto_1.backupFile)(binPath, version || undefined);
            fs.writeFileSync(binPath, buf);
            if (!upgraded)
                console.log('[ok] agy binary patched for custom model support.');
            if (os.platform() === 'darwin') {
                try {
                    (0, child_process_1.execSync)(`codesign --force --sign - "${binPath}"`, { stdio: 'ignore' });
                    (0, child_process_1.execSync)(`xattr -d com.apple.quarantine "${binPath}"`, { stdio: 'ignore' });
                }
                catch { /* macOS code signing not available */ }
            }
        }
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            console.warn('[Warn] agy binary patching failed:', e);
        }
    }
}
async function startAndDelegate(agyArgs) {
    // agy starts interactive mode by default when no flags are given
    const agyBin = getAgyBin();
    if (!fs.existsSync(agyBin)) {
        console.error(`\n[Error] agy CLI not found!`);
        console.error(`Search location checked: ${agyBin}`);
        console.error('\nPlease install the official Antigravity CLI first.');
        console.error('If installed in a custom location, set the AGY_BIN environment variable:');
        console.error('  export AGY_BIN=/path/to/agy\n');
        process.exit(1);
    }
    const version = getAgyVersion(agyBin);
    if (version) {
        await (0, manifest_1.checkAgyCompatibility)(version);
    }
    ensureAgyPatched(agyBin);
    process.stdout.write('Starting proxy... ');
    const port = await ensureProxy();
    console.log(`ready (port ${port})\n`);
    const child = (0, child_process_1.spawn)(agyBin, agyArgs, { stdio: 'inherit', shell: true });
    child.on('exit', async (code) => { await (0, proxy_1.stopProxy)(); process.exit(code || 0); });
    process.on('SIGINT', async () => { child.kill(); await (0, proxy_1.stopProxy)(); process.exit(0); });
}
async function main() {
    let args = process.argv.slice(2);
    // Parse and strip verbose/debug flags
    const isDebug = args.includes('--verbose') || args.includes('--debug') || process.env.ANTIGRAVITY_DEBUG === 'true';
    if (isDebug) {
        process.env.ANTIGRAVITY_DEBUG = 'true';
    }
    args = args.filter(a => a !== '--verbose' && a !== '--debug');
    const cmd = args[0];
    // --- Model management ---
    if (cmd === 'models') {
        const sub = args[1];
        if (sub === 'list') {
            const models = (0, config_1.listModels)();
            if (models.length === 0) {
                console.log('No models. Use "antigravity models add".');
                return;
            }
            console.log('\nCustom Models:\n' + '='.repeat(50));
            for (const m of models) {
                console.log(`  ${m.displayName || m.name}`);
                console.log(`  Provider: ${m.provider}  |  Model: ${m.externalModelName}`);
                console.log(`  URL: ${m.apiUrl}\n`);
            }
            return;
        }
        if (sub === 'add') {
            console.log('\n  Add Custom AI Model\n' + '─'.repeat(40));
            const answers = await inquirer_1.default.prompt([
                { type: 'list', name: 'provider', message: 'Provider:', choices: [
                        'openai', 'anthropic', 'google', 'ollama', 'openrouter', 'custom',
                        'deepseek', 'groq', 'mistral', 'cerebras', 'kimi', 'fireworks',
                        'lmstudio', 'llamacpp', 'nvidia'
                    ] },
                { type: 'input', name: 'modelId', message: 'Model ID (e.g. gpt-4o):', validate: (v) => v.length > 0 },
                { type: 'input', name: 'displayName', message: 'Display name:' },
                { type: 'password', name: 'apiKey', message: 'API Key:', mask: '*' },
                { type: 'input', name: 'apiUrl', message: 'API URL:', default: (a) => {
                        const d = {
                            openai: 'https://api.openai.com/v1/chat/completions',
                            anthropic: 'https://api.anthropic.com/v1/messages',
                            google: `https://generativelanguage.googleapis.com/v1beta/models/${a.modelId}:generateContent`,
                            ollama: 'http://localhost:11434/v1/chat/completions',
                            openrouter: 'https://openrouter.ai/api/v1/chat/completions',
                            custom: 'https://api.together.xyz/v1',
                            deepseek: 'https://api.deepseek.com/anthropic',
                            groq: 'https://api.groq.com/openai/v1',
                            mistral: 'https://api.mistral.ai/v1',
                            cerebras: 'https://api.cerebras.ai/v1',
                            kimi: 'https://api.moonshot.ai/anthropic/v1',
                            fireworks: 'https://api.fireworks.ai/inference/v1',
                            lmstudio: 'http://localhost:1234/v1',
                            llamacpp: 'http://localhost:8080/v1',
                            nvidia: 'https://integrate.api.nvidia.com/v1',
                        };
                        return d[a.provider] || '';
                    } },
            ]);
            const r = (0, config_1.addModel)({ name: 'models/' + answers.modelId, displayName: answers.displayName || answers.modelId, description: '', provider: answers.provider, apiKey: answers.apiKey || 'none', apiUrl: answers.apiUrl, externalModelName: answers.modelId });
            console.log(r.success ? `\nModel "${answers.displayName || answers.modelId}" added!\n` : `\nFailed: ${r.error}\n`);
            return;
        }
        if (sub === 'remove') {
            const name = args[2];
            if (!name) {
                console.log('Usage: antigravity models remove <name>');
                return;
            }
            (0, config_1.removeModel)(name);
            console.log(`Model "${name}" removed.`);
            return;
        }
        if (sub === 'import') {
            const desktopPath = path.join(os.homedir(), '.gemini', 'antigravity', 'custom_models.json');
            if (!fs.existsSync(desktopPath)) {
                console.log('Desktop Antigravity models not found.\nUse "antigravity models add" instead.');
                return;
            }
            try {
                const models = JSON.parse(fs.readFileSync(desktopPath, 'utf-8')).models || [];
                if (models.length === 0) {
                    console.log('No models in desktop config.');
                    return;
                }
                (0, config_1.ensureConfigDir)();
                const imported = [];
                for (const m of models) {
                    let key = m.apiKey || 'none';
                    if (m.encrypted && key !== 'none') {
                        try {
                            key = (0, crypto_1.decryptString)(key);
                        }
                        catch (e2) {
                            if (process.env.ANTIGRAVITY_DEBUG === 'true') {
                                console.debug('[Debug] decryptString failed for model:', m.name, e2.message);
                            }
                        }
                    }
                    imported.push({ name: m.name, displayName: m.displayName, description: m.description, provider: m.provider, apiKey: key, apiUrl: m.apiUrl, externalModelName: m.externalModelName, allowUnauthorized: m.allowUnauthorized });
                }
                (0, config_1.saveModels)(imported);
                console.log(`Imported ${imported.length} model(s). NOTE: API keys from desktop need to be re-entered via "antigravity models add".`);
            }
            catch (e) {
                console.error('Import failed:', e);
            }
            return;
        }
        console.log('Usage: antigravity models <list|add|remove|import>');
        return;
    }
    // --- Info commands ---
    if (cmd === 'configure') {
        console.log(`Models file: ${path.join(os.homedir(), '.free-antigravity', 'models.json')}`);
        console.log(`Models configured: ${(0, config_1.listModels)().length}`);
        console.log(`Proxy: ${(0, proxy_1.getProxyPort)() ? `port ${(0, proxy_1.getProxyPort)()}` : 'not running'}`);
        console.log(`agy binary: ${getAgyBin()}`);
        return;
    }
    if (cmd === 'version' || cmd === '--version' || cmd === '-V' || cmd === '-v') {
        console.log(`Free Antigravity CLI v${getVersion()} (Community Edition)`);
        return;
    }
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
        console.log(`Free Antigravity CLI v${getVersion()} - Community Edition
Wraps the official agy CLI with custom model support.

Commands:
  (no args)    Start interactive chat with custom model support
  chat         Same as above
  models list  List custom models
  models add   Add a custom model
  models remove <name>  Remove a custom model
  models import  Import models from desktop Antigravity
  configure    Show configuration
  version      Show version
  help         This help

Any other arguments are passed directly to agy CLI.`);
        return;
    }
    // --- Default: delegate to agy with proxy ---
    if (cmd === 'chat')
        args.shift();
    await startAndDelegate(args);
}
main().catch(console.error);
//# sourceMappingURL=cli.js.map
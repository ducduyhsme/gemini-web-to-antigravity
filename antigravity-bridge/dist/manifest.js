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
exports.loadPatchManifest = loadPatchManifest;
exports.checkAgyCompatibility = checkAgyCompatibility;
/**
 * Remote and local patch manifest loader.
 * Fetches known patch strategies from GitHub (or local cache) so the CLI
 * can stay up-to-date without a new npm release every time agy changes.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const logger_1 = require("./logger");
const MANIFEST_URL = 'https://raw.githubusercontent.com/vahapogut/free-antigravity-cli/main/patch-manifest.json';
function getCachePath() {
    return path.join(os.homedir(), '.free-antigravity', 'patch-manifest.json');
}
function getBundledPath() {
    return path.join(__dirname, '..', 'patch-manifest.json');
}
function isOnline() {
    // Simple heuristic: if we can resolve the URL hostname
    try {
        const { hostname } = new URL(MANIFEST_URL);
        require('dns').lookupSync(hostname);
        return true;
    }
    catch {
        return false;
    }
}
async function fetchRemoteManifest() {
    try {
        const res = await fetch(MANIFEST_URL, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        return data;
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            logger_1.log.debug('[Manifest] Remote fetch failed:', e);
        }
        return null;
    }
}
function loadLocalManifest(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            logger_1.log.debug('[Manifest] Local load failed:', e);
        }
        return null;
    }
}
function saveCache(manifest) {
    try {
        const cachePath = getCachePath();
        const dir = path.dirname(cachePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(manifest, null, 2), 'utf-8');
    }
    catch (e) {
        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
            logger_1.log.debug('[Manifest] Cache save failed:', e);
        }
    }
}
/**
 * Load the best available patch manifest:
 * 1. Try remote (GitHub raw) if online
 * 2. Fall back to local cache
 * 3. Fall back to bundled manifest in package
 */
async function loadPatchManifest() {
    let manifest = null;
    if (isOnline()) {
        manifest = await fetchRemoteManifest();
        if (manifest) {
            saveCache(manifest);
            logger_1.log.info('[Manifest] Loaded remote patch manifest.');
            return manifest;
        }
    }
    // Try user cache
    manifest = loadLocalManifest(getCachePath());
    if (manifest) {
        logger_1.log.info('[Manifest] Loaded cached patch manifest.');
        return manifest;
    }
    // Try bundled fallback (shipped with npm package)
    manifest = loadLocalManifest(getBundledPath());
    if (manifest) {
        logger_1.log.info('[Manifest] Loaded bundled patch manifest.');
        return manifest;
    }
    logger_1.log.warn('[Manifest] No patch manifest found. Using built-in defaults.');
    return null;
}
/**
 * Check whether the currently installed agy version is known/tested.
 * Warns the user if it is newer than the latest known version.
 */
async function checkAgyCompatibility(currentVersion) {
    const manifest = await loadPatchManifest();
    if (!manifest || !manifest.latestKnownAgyVersion)
        return;
    if (currentVersion !== manifest.latestKnownAgyVersion) {
        console.warn(`[Warn] agy ${currentVersion} has not been tested with free-antigravity-cli. ` +
            `Latest tested: ${manifest.latestKnownAgyVersion}. ` +
            `If you encounter issues, please report at https://github.com/vahapogut/free-antigravity-cli/issues`);
    }
}
//# sourceMappingURL=manifest.js.map
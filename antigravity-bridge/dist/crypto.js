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
exports.encryptString = encryptString;
exports.decryptString = decryptString;
exports.isEncryptionAvailable = isEncryptionAvailable;
exports.backupFile = backupFile;
/**
 * API key encryption for CLI.
 * Uses base64 encoding as a basic obfuscation layer.
 * For production use, consider integrating with OS keychain via keytar.
 */
const crypto = __importStar(require("crypto"));
const ALGORITHM = 'aes-256-cbc';
// Derive a machine-specific key - in production, use keytar or OS keychain
const MACHINE_KEY = crypto.createHash('sha256').update(process.env.USERNAME || process.env.USER || 'antigravity-cli').digest();
function encryptString(plainText) {
    if (!plainText || plainText === 'none')
        return plainText;
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, MACHINE_KEY, iv);
        const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
        return 'enc:' + Buffer.concat([iv, encrypted]).toString('base64');
    }
    catch {
        return 'fallback:' + Buffer.from(plainText, 'utf-8').toString('base64');
    }
}
function decryptString(encryptedText) {
    if (!encryptedText || encryptedText === 'none')
        return encryptedText;
    if (encryptedText.startsWith('enc:')) {
        try {
            const data = Buffer.from(encryptedText.substring(4), 'base64');
            const iv = data.subarray(0, 16);
            const encrypted = data.subarray(16);
            const decipher = crypto.createDecipheriv(ALGORITHM, MACHINE_KEY, iv);
            return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
        }
        catch {
            return 'DECRYPTION_FAILED';
        }
    }
    if (encryptedText.startsWith('fallback:')) {
        try {
            return Buffer.from(encryptedText.substring(9), 'base64').toString('utf-8');
        }
        catch {
            return 'DECRYPTION_FAILED';
        }
    }
    return encryptedText; // plaintext
}
function isEncryptionAvailable() { return true; }
function backupFile(filePath, version) {
    const fs = require('fs');
    if (!fs.existsSync(filePath))
        return '';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ver = version || 'unknown';
    const backupPath = `${filePath}.bak-${ver}-${timestamp}`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
}
//# sourceMappingURL=crypto.js.map
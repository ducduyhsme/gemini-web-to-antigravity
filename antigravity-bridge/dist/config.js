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
exports.getConfigDir = getConfigDir;
exports.getModelsPath = getModelsPath;
exports.ensureConfigDir = ensureConfigDir;
exports.loadModels = loadModels;
exports.saveModels = saveModels;
exports.addModel = addModel;
exports.removeModel = removeModel;
exports.getModel = getModel;
exports.listModels = listModels;
/**
 * Configuration and model storage management.
 * Stores custom models in ~/.free-antigravity/models.json
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto_1 = require("./crypto");
function getConfigDir() {
    return path.join(os.homedir(), '.free-antigravity');
}
function getModelsPath() {
    return path.join(getConfigDir(), 'models.json');
}
function ensureConfigDir() {
    const dir = getConfigDir();
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
function loadModels() {
    const filePath = getModelsPath();
    if (!fs.existsSync(filePath))
        return [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        const models = parsed.models || [];
        return models.map((m) => {
            if (m.encrypted && m.apiKey && m.apiKey !== 'none') {
                try {
                    return { ...m, apiKey: (0, crypto_1.decryptString)(m.apiKey), encrypted: false };
                }
                catch (e) {
                    if (process.env.ANTIGRAVITY_DEBUG === 'true') {
                        console.debug('[Debug] decryptString failed for model:', m.name, e.message);
                    }
                    return m;
                }
            }
            return m;
        });
    }
    catch (e) {
        console.error('Failed to load models:', e);
        return [];
    }
}
function saveModels(models) {
    ensureConfigDir();
    const encrypted = models.map((m) => {
        if (m.apiKey && m.apiKey !== 'none' && !m.encrypted) {
            return { ...m, apiKey: (0, crypto_1.encryptString)(m.apiKey), encrypted: true };
        }
        return m;
    });
    fs.writeFileSync(getModelsPath(), JSON.stringify({ models: encrypted }, null, 2), 'utf-8');
}
function addModel(model) {
    const models = loadModels();
    const existingIdx = models.findIndex((m) => m.name === model.name);
    if (existingIdx !== -1) {
        if (model.apiKey && (model.apiKey.includes('...') || model.apiKey.startsWith('***'))) {
            model.apiKey = models[existingIdx].apiKey;
        }
        models[existingIdx] = model;
    }
    else {
        models.push(model);
    }
    saveModels(models);
    return { success: true };
}
function removeModel(modelName) {
    const models = loadModels().filter((m) => m.name !== modelName);
    saveModels(models);
    return { success: true };
}
function getModel(modelName) {
    return loadModels().find((m) => m.name === modelName || m.displayName === modelName);
}
function listModels() {
    return loadModels();
}
//# sourceMappingURL=config.js.map
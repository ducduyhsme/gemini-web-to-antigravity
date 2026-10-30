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
exports.generateModelPlaceholderId = generateModelPlaceholderId;
exports.getCustomModelsPath = getCustomModelsPath;
exports.toSlug = toSlug;
exports.loadCustomModels = loadCustomModels;
exports.startProxy = startProxy;
exports.stopProxy = stopProxy;
exports.getProxyPort = getProxyPort;
/**
 * Free Antigravity CLI - Local Proxy Server.
 * Routes requests to Google, OpenAI, Anthropic, Ollama, and custom providers.
 * Intercepts model lists to inject user-defined custom models.
 */
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const logger_1 = require("./logger");
// --- State ---
let server = null;
let proxyPort = 0;
const shared_1 = require("./proxy/shared");
const modelUtils_1 = require("./proxy/modelUtils");
const registry = __importStar(require("./proxy/registry"));
const crypto_1 = require("./crypto");
const schemaValidator_1 = require("./schemaValidator");
// --- Model Helpers ---
function generateModelPlaceholderId(model) {
    const input = (model.displayName || model.name || 'custom-model').toLowerCase();
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) + hash + input.charCodeAt(i);
        hash = hash >>> 0;
    }
    const placeholderNum = 400 + (Math.abs(hash) % 200);
    return `MODEL_PLACEHOLDER_M${placeholderNum}`;
}
function getCustomModelsPath() {
    const home = os.homedir();
    return path.join(home, '.free-antigravity', 'models.json');
}
function toSlug(model) {
    return ('custom-' +
        (model.externalModelName || model.name)
            .replace(/^models\//, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase());
}
// --- Model Loading ---
function loadCustomModels() {
    const filePath = getCustomModelsPath();
    if (!fs.existsSync(filePath)) {
        // Create default config directory and file
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({ models: [] }, null, 2), 'utf-8');
        return [];
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        const models = parsed.models || [];
        // Auto-migration: encrypt plaintext keys
        const needsMigration = models.some((m) => !m.encrypted && m.apiKey && m.apiKey !== 'none' && !m.apiKey.startsWith('enc:') && !m.apiKey.startsWith('fallback:'));
        if (needsMigration) {
            logger_1.log.info('[Proxy] Migrating plaintext keys to encrypted format...');
            const encryptedModels = models.map((m) => {
                if (m.apiKey && m.apiKey !== 'none' && !m.encrypted) {
                    return { ...m, apiKey: (0, crypto_1.encryptString)(m.apiKey), encrypted: true };
                }
                return m;
            });
            fs.writeFileSync(filePath, JSON.stringify({ models: encryptedModels }, null, 2), 'utf-8');
            return encryptedModels;
        }
        // Decrypt keys for in-memory use
        const decrypted = models.map((m) => {
            if (m.encrypted && m.apiKey && m.apiKey !== 'none') {
                try {
                    return { ...m, apiKey: (0, crypto_1.decryptString)(m.apiKey), encrypted: false };
                }
                catch {
                    return m;
                }
            }
            return m;
        });
        // Validate models
        const validModels = [];
        for (let i = 0; i < decrypted.length; i++) {
            const validation = (0, schemaValidator_1.validateCustomModel)(decrypted[i]);
            if (validation.valid) {
                validModels.push(decrypted[i]);
            }
            else {
                logger_1.log.warn(`[Proxy] Skipping invalid model at index ${i}: ${validation.error}`);
            }
        }
        return validModels;
    }
    catch (e) {
        logger_1.log.error('[Proxy] Failed to parse models config:', e);
        return [];
    }
}
// --- Google Proxy ---
function proxyToGoogle(req, res, reqBody) {
    const targetUrl = 'https://daily-cloudcode-pa.googleapis.com';
    const parsedUrl = new URL(req.url, targetUrl);
    const headers = { ...req.headers };
    headers['host'] = 'daily-cloudcode-pa.googleapis.com';
    delete headers['connection'];
    delete headers['keep-alive'];
    const options = { method: req.method, headers: headers };
    const proxyReq = https.request(parsedUrl, options, (proxyRes) => {
        proxyReq.setTimeout(60000, () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Google API request timed out' } }));
            }
        });
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
        logger_1.log.error('[Proxy] Google Forwarding Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Proxy forwarding failed: ' + err.message } }));
    });
    if (reqBody)
        proxyReq.write(reqBody);
    proxyReq.end();
}
// --- Custom Model Request Handler ---
function handleCustomModelRequest(res, model, geminiBody, isStream, retryCount = 0) {
    const MAX_RETRIES = Math.min(Math.max(model.maxRetries ?? 3, 0), 5);
    const REQUEST_TIMEOUT_MS = model.timeout || 120000;
    const provider = model.provider === 'custom' || model.provider === 'openrouter' ? 'openai' : model.provider;
    const payload = registry.translateRequest(provider, geminiBody, model.externalModelName);
    const headers = registry.getProviderHeaders(provider, model.apiKey);
    if (isStream && registry.supportsStreaming(provider)) {
        payload.stream = true;
    }
    let finalUrlStr = model.apiUrl;
    if (provider === 'google' || provider === 'ollama') {
        const t = registry.getTranslator(provider);
        finalUrlStr = registry.getProviderUrl(finalUrlStr, model.externalModelName, isStream, t);
    }
    else if (provider === 'openai' || model.provider === 'custom' || model.provider === 'openrouter') {
        // Auto-fix for gemini-web-to-api instances on local ports (e.g. 4981, 4982) where endpoint is /openai/v1
        if ((finalUrlStr.includes('127.0.0.1:498') || finalUrlStr.includes('localhost:498')) && finalUrlStr.includes('/v1/chat/completions') && !finalUrlStr.includes('/openai/v1')) {
            finalUrlStr = finalUrlStr.replace('/v1/chat/completions', '/openai/v1/chat/completions');
        }
        const urlLower = finalUrlStr.toLowerCase();
        if (!urlLower.includes('/chat/completions') && !urlLower.includes('/completions')) {
            if (urlLower.includes('127.0.0.1:498') || urlLower.includes('localhost:498')) {
                finalUrlStr = finalUrlStr.replace(/\/+$/, '') + '/openai/v1/chat/completions';
            }
            else if (finalUrlStr.endsWith('/v1'))
                finalUrlStr += '/chat/completions';
            else if (!finalUrlStr.endsWith('/'))
                finalUrlStr += '/v1/chat/completions';
            else
                finalUrlStr += 'v1/chat/completions';
        }
    }
    else if (provider === 'anthropic') {
        if ((finalUrlStr.includes('127.0.0.1:498') || finalUrlStr.includes('localhost:498')) && finalUrlStr.includes('/v1/messages') && !finalUrlStr.includes('/claude/v1')) {
            finalUrlStr = finalUrlStr.replace('/v1/messages', '/claude/v1/messages');
        }
    }
    const url = new URL(finalUrlStr);
    const client = url.protocol === 'https:' ? https : http;
    const options = { method: 'POST', headers: headers };
    if (model.allowUnauthorized) {
        options.rejectUnauthorized = false;
        logger_1.log.warn(`[Proxy] SSL verification DISABLED for ${model.name}`);
    }
    logger_1.log.info(`[Proxy] Routing ${model.name} → ${model.provider} (${isStream ? 'stream' : 'non-stream'})${retryCount > 0 ? ` retry ${retryCount}` : ''}`);
    const request = client.request(url, options, (apiRes) => {
        apiRes.on('error', (err) => {
            logger_1.log.error(`[Proxy] Upstream error for ${model.name}:`, err.message);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Upstream error: ' + err.message } }));
            }
        });
        if (isStream) {
            if (apiRes.statusCode >= 400) {
                let errorBody = '';
                apiRes.on('data', (chunk) => errorBody += chunk.toString());
                apiRes.on('end', () => {
                    logger_1.log.error(`[Proxy] Stream API error (${apiRes.statusCode}): ${errorBody.substring(0, 200)}`);
                    if (retryCount < MAX_RETRIES) {
                        setTimeout(() => handleCustomModelRequest(res, model, geminiBody, isStream, retryCount + 1), 1000 * (retryCount + 1));
                        return;
                    }
                    res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(errorBody);
                });
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            let buffer = '';
            apiRes.on('data', (chunk) => {
                buffer += chunk.toString('utf-8');
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: '))
                        continue;
                    const dataStr = trimmed.substring(6).trim();
                    if (dataStr === '[DONE]')
                        continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const mapped = registry.translateStreamChunk(provider, parsed, model.name);
                        if (mapped) {
                            res.write(`data: ${JSON.stringify({ response: { candidates: [mapped] }, traceId: '', metadata: {} })}\n\n`);
                        }
                    }
                    catch {
                        if (process.env.ANTIGRAVITY_DEBUG === 'true') {
                            logger_1.log.debug('[Proxy] Streaming chunk parse failed (partial chunk - safe to ignore)');
                        }
                    }
                }
            });
            apiRes.on('end', () => {
                if (buffer.trim().startsWith('data: ')) {
                    const dataStr = buffer.trim().substring(6).trim();
                    if (dataStr !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(dataStr);
                            const mapped = registry.translateStreamChunk(provider, parsed, model.name);
                            if (mapped) {
                                res.write(`data: ${JSON.stringify({ response: { candidates: [mapped] }, traceId: '', metadata: {} })}\n\n`);
                            }
                        }
                        catch {
                            if (process.env.ANTIGRAVITY_DEBUG === 'true') {
                                logger_1.log.debug('[Proxy] Final buffer chunk parse failed (safe to ignore)');
                            }
                        }
                    }
                }
                const finalChunk = { response: { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP', index: 0 }] }, traceId: '', metadata: {} };
                res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                res.end();
            });
        }
        else {
            let body = '';
            apiRes.on('data', (chunk) => (body += chunk));
            apiRes.on('end', () => {
                if (apiRes.statusCode >= 500 && retryCount < MAX_RETRIES) {
                    setTimeout(() => handleCustomModelRequest(res, model, geminiBody, isStream, retryCount + 1), 1000 * Math.pow(2, retryCount));
                    return;
                }
                if (apiRes.statusCode === 429 && retryCount < MAX_RETRIES) {
                    setTimeout(() => handleCustomModelRequest(res, model, geminiBody, isStream, retryCount + 1), 2000 * Math.pow(2, retryCount));
                    return;
                }
                if (apiRes.statusCode >= 400) {
                    res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(body);
                    return;
                }
                try {
                    const parsed = JSON.parse(body);
                    const reasoning = parsed.choices?.[0]?.message?.reasoning_content;
                    if (reasoning) {
                        shared_1.modelReasoningContent.set(model.name, reasoning);
                        (0, shared_1.touchStateTimestamp)(shared_1.stateTimestamps.reasoning, model.name);
                    }
                    const providerForResponse = model.provider === 'custom' || model.provider === 'openrouter' ? 'openai' : model.provider;
                    const mapped = registry.translateResponse(providerForResponse, parsed, model.name);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ response: mapped, traceId: '', metadata: {} }));
                }
                catch (e) {
                    if (retryCount < MAX_RETRIES) {
                        setTimeout(() => handleCustomModelRequest(res, model, geminiBody, isStream, retryCount + 1), 1000 * (retryCount + 1));
                        return;
                    }
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Failed to translate response' } }));
                }
            });
        }
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy();
        if (retryCount < MAX_RETRIES) {
            setTimeout(() => handleCustomModelRequest(res, model, geminiBody, isStream, retryCount + 1), 1000 * (retryCount + 1));
            return;
        }
        if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: `Request timeout after ${REQUEST_TIMEOUT_MS / 1000}s` } }));
        }
    });
    request.on('error', (err) => {
        logger_1.log.error('[Proxy] Custom Model Request Error:', err);
        if (retryCount < MAX_RETRIES) {
            setTimeout(() => handleCustomModelRequest(res, model, geminiBody, isStream, retryCount + 1), 1000 * (retryCount + 1));
            return;
        }
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Custom model request failed: ' + err.message } }));
        }
    });
    request.write(JSON.stringify(payload));
    request.end();
}
// --- Main Request Handler ---
function handleRequest(req, res) {
    // Strip binary patch padding
    req.url = req.url.replace(/\/v1internal\/x+/, '');
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    // Health check
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
        const memUsage = process.memoryUsage();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), port: proxyPort, memory: { rssMB: Math.round(memUsage.rss / 1024 / 1024), heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024) }, timestamp: new Date().toISOString() }));
        return;
    }
    const MAX_BODY_SIZE = 10 * 1024 * 1024;
    let bodyLength = 0;
    let bodyRejected = false;
    const bodyChunks = [];
    req.on('data', (chunk) => {
        bodyLength += chunk.length;
        if (bodyLength > MAX_BODY_SIZE) {
            if (!bodyRejected) {
                bodyRejected = true;
                req.destroy();
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'Request body too large' }));
            }
            return;
        }
        bodyChunks.push(chunk);
    });
    req.on('end', () => {
        if (bodyRejected)
            return;
        const fullBody = Buffer.concat(bodyChunks);
        logger_1.log.info(`[Proxy] ${req.method} ${req.url}`);
        if (process.env.ANTIGRAVITY_DEBUG) {
            logger_1.log.info(`[Proxy] Headers: ${JSON.stringify(req.headers)}`);
        }
        // 1. Intercept fetchAvailableModels - inject custom models
        if (req.url.includes('/v1internal:fetchAvailableModels')) {
            logger_1.log.info('[Proxy] Intercepting fetchAvailableModels');
            const targetUrl = 'https://daily-cloudcode-pa.googleapis.com';
            const fwdHeaders = { ...req.headers };
            fwdHeaders['host'] = 'daily-cloudcode-pa.googleapis.com';
            delete fwdHeaders['connection'];
            delete fwdHeaders['keep-alive'];
            delete fwdHeaders['accept-encoding'];
            const googleReq = https.request(new URL(req.url, targetUrl), { method: req.method, headers: fwdHeaders }, (googleRes) => {
                googleReq.setTimeout(30000, () => { googleReq.destroy(); if (!res.headersSent) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ models: {} }));
                } });
                let googleBody = '';
                googleRes.on('data', (chunk) => (googleBody += chunk));
                googleRes.on('end', () => {
                    try {
                        const googleJson = JSON.parse(googleBody);
                        const customModels = loadCustomModels();
                        const mergeModels = (target) => {
                            if (Array.isArray(target)) {
                                const mapped = customModels.map((m) => {
                                    const cap = (0, modelUtils_1.detectModelCapabilities)(m, true);
                                    return { name: 'models/' + generateModelPlaceholderId(m), version: '1.0', displayName: m.displayName, description: m.description, inputTokenLimit: cap.maxTokens, outputTokenLimit: cap.maxOutputTokens, supportedGenerationMethods: ['generateContent', 'countTokens'], temperature: cap.isThinking ? undefined : 0.7, topP: cap.isThinking ? undefined : 0.9, topK: cap.isThinking ? undefined : 40, disabled: false, tagTitle: 'Custom', tagDescription: 'Custom Provider Model' };
                                });
                                return [...mapped, ...target];
                            }
                            else if (target && typeof target === 'object') {
                                const result = { ...target };
                                customModels.forEach((m) => {
                                    const slug = toSlug(m);
                                    const cap = (0, modelUtils_1.detectModelCapabilities)(m, true);
                                    // Remove any conflicting or disabled stock Google models with same name, slug, or externalModelName
                                    for (const k of Object.keys(result)) {
                                        if (k === slug || k === m.externalModelName || result[k]?.displayName === m.displayName) {
                                            delete result[k];
                                        }
                                    }
                                    result[slug] = {
                                        displayName: m.displayName,
                                        supportsImages: cap.supportsImages,
                                        supportsThinking: cap.isThinking,
                                        recommended: true,
                                        maxTokens: cap.maxTokens || 1048576,
                                        maxOutputTokens: cap.maxOutputTokens || 4096,
                                        tokenizerType: 'LLAMA_WITH_SPECIAL',
                                        model: generateModelPlaceholderId(m),
                                        apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                                        modelProvider: 'MODEL_PROVIDER_GOOGLE',
                                        disabled: false,
                                        tagTitle: 'Custom',
                                        tagDescription: 'Custom Provider Model'
                                    };
                                    m._slug = slug;
                                });
                                return result;
                            }
                            return target;
                        };
                        let merged = false;
                        if (googleJson.models) {
                            googleJson.models = mergeModels(googleJson.models);
                            merged = true;
                        }
                        if (googleJson.availableModels) {
                            googleJson.availableModels = mergeModels(googleJson.availableModels);
                            merged = true;
                        }
                        if (googleJson.available_models) {
                            googleJson.available_models = mergeModels(googleJson.available_models);
                            merged = true;
                        }
                        if (!merged) {
                            const modelsMap = {};
                            customModels.forEach((m) => {
                                const slug = toSlug(m);
                                modelsMap[slug] = {
                                    displayName: m.displayName,
                                    recommended: true,
                                    maxTokens: 1048576,
                                    maxOutputTokens: 4096,
                                    tokenizerType: 'LLAMA_WITH_SPECIAL',
                                    model: generateModelPlaceholderId(m),
                                    apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                                    modelProvider: 'MODEL_PROVIDER_GOOGLE',
                                    disabled: false,
                                    tagTitle: 'Custom',
                                    tagDescription: 'Custom Provider Model'
                                };
                                m._slug = slug;
                            });
                            googleJson.models = modelsMap;
                        }
                        // Inject custom model slugs into agentModelSorts at the TOP of the list
                        const customSlugs = customModels.map((m) => m._slug).filter(Boolean);
                        if (customSlugs.length > 0) {
                            if (!googleJson.agentModelSorts || !Array.isArray(googleJson.agentModelSorts) || googleJson.agentModelSorts.length === 0) {
                                googleJson.agentModelSorts = [{ displayName: 'Default', groups: [{ displayName: '', modelIds: [...customSlugs] }] }];
                            }
                            else {
                                googleJson.agentModelSorts.forEach((sort) => {
                                    if (sort.groups && Array.isArray(sort.groups) && sort.groups.length > 0) {
                                        sort.groups.forEach((group) => {
                                            if (group.modelIds && Array.isArray(group.modelIds)) {
                                                const conflicting = customModels.map(m => m.externalModelName).filter(Boolean);
                                                group.modelIds = group.modelIds.filter(id => !customSlugs.includes(id) && !conflicting.includes(id));
                                            }
                                        });
                                        if (sort.groups[0] && Array.isArray(sort.groups[0].modelIds)) {
                                            sort.groups[0].modelIds.unshift(...customSlugs);
                                        }
                                    }
                                });
                            }
                        }
                        if (googleJson.error && customModels.length > 0) {
                            delete googleJson.error;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(googleJson));
                    }
                    catch (err) {
                        // Google may return binary/protobuf on auth errors. Log cleanly.
                        if (googleRes.statusCode && googleRes.statusCode >= 400) {
                            logger_1.log.info(`[Proxy] fetchAvailableModels: Google returned ${googleRes.statusCode}, using custom models only`);
                        }
                        else {
                            logger_1.log.info('[Proxy] fetchAvailableModels: response parse failed, using custom models only');
                        }
                        const customModels = loadCustomModels();
                        const mappedCustom = {};
                        const slugs = [];
                        customModels.forEach((m) => {
                            const slug = toSlug(m);
                            slugs.push(slug);
                            mappedCustom[slug] = {
                                displayName: m.displayName,
                                maxTokens: 1048576,
                                maxOutputTokens: 4096,
                                model: generateModelPlaceholderId(m),
                                apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                                modelProvider: 'MODEL_PROVIDER_GOOGLE',
                                disabled: false,
                                tagTitle: 'Custom'
                            };
                        });
                        const agentModelSorts = slugs.length > 0 ? [{ displayName: 'Default', groups: [{ displayName: '', modelIds: slugs }] }] : [];
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ models: mappedCustom, agentModelSorts }));
                    }
                });
            });
            googleReq.on('error', (err) => {
                logger_1.log.error('[Proxy] fetchAvailableModels forward error:', err);
                const customModels = loadCustomModels();
                const mappedCustom = {};
                const slugs = [];
                customModels.forEach((m) => {
                    const slug = toSlug(m);
                    slugs.push(slug);
                    mappedCustom[slug] = {
                        displayName: m.displayName,
                        maxTokens: 1048576,
                        maxOutputTokens: 4096,
                        model: generateModelPlaceholderId(m),
                        apiProvider: 'API_PROVIDER_GOOGLE_GEMINI',
                        modelProvider: 'MODEL_PROVIDER_GOOGLE',
                        disabled: false,
                        tagTitle: 'Custom'
                    };
                });
                const agentModelSorts = slugs.length > 0 ? [{ displayName: 'Default', groups: [{ displayName: '', modelIds: slugs }] }] : [];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ models: mappedCustom, agentModelSorts }));
            });
            if (fullBody.length > 0)
                googleReq.write(fullBody);
            googleReq.end();
            return;
        }
        // 2. Intercept standard model list
        if (req.method === 'GET' && (req.url.endsWith('/models') || req.url.includes('/models?'))) {
            logger_1.log.info('[Proxy] Intercepting models list');
            const targetUrl = 'https://generativelanguage.googleapis.com';
            const mdlHeaders = { ...req.headers };
            mdlHeaders['host'] = 'generativelanguage.googleapis.com';
            delete mdlHeaders['connection'];
            const googleReq = https.request(new URL(req.url, targetUrl), { method: 'GET', headers: mdlHeaders }, (googleRes) => {
                let body = '';
                googleRes.on('data', (chunk) => (body += chunk));
                googleRes.on('end', () => {
                    try {
                        const googleJson = JSON.parse(body);
                        const customModels = loadCustomModels();
                        const mappedCustom = customModels.map((m) => ({ name: 'models/' + generateModelPlaceholderId(m), version: '1.0', displayName: m.displayName, description: m.description, inputTokenLimit: 1048576, outputTokenLimit: 4096, supportedGenerationMethods: ['generateContent', 'countTokens'], temperature: 0.7, topP: 0.9, topK: 40 }));
                        googleJson.models = [...mappedCustom, ...(googleJson.models || [])];
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(googleJson));
                    }
                    catch {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(body);
                    }
                });
            });
            googleReq.on('error', () => { res.writeHead(502); res.end(); });
            googleReq.end();
            return;
        }
        // 3. Intercept generateContent / streamGenerateContent for custom models
        const isCloudCodeStream = req.url.includes('/v1internal:streamGenerateContent') || req.url.includes('/v1internal:generateContent');
        if (req.method === 'POST' && isCloudCodeStream) {
            try {
                const reqJson = JSON.parse(fullBody.toString('utf-8'));
                const candidateNames = [
                    reqJson.model,
                    reqJson.modelId,
                    reqJson.model_id,
                    reqJson.request?.model,
                    reqJson.plannerConfig?.requestedModel?.choice?.value,
                    reqJson.plannerConfig?.modelName,
                    reqJson.requestedModel?.choice?.value,
                    reqJson.request?.plannerConfig?.requestedModel?.choice?.value
                ].filter(Boolean);

                const customModels = loadCustomModels();
                const matched = customModels.find((m) => {
                    const enumName = generateModelPlaceholderId(m);
                    const slug = toSlug(m);
                    return candidateNames.some((name) => {
                        const str = String(name);
                        return str === m.name ||
                            str === 'models/' + m.name ||
                            str === slug ||
                            str === 'models/' + slug ||
                            str === m.displayName ||
                            str === enumName ||
                            str === 'models/' + enumName ||
                            str === m.externalModelName ||
                            str === 'models/' + m.externalModelName;
                    });
                });
                if (matched) {
                    logger_1.log.info(`[Proxy] Custom model match: ${matched.displayName}`);
                    const isStream = req.url.includes('streamGenerateContent') || req.url.includes('alt=sse');
                    handleCustomModelRequest(res, matched, (reqJson.request || reqJson), isStream);
                    return;
                }
            }
            catch (err) {
                logger_1.log.error('[Proxy] Parse error:', err);
            }
        }
        // 4. Intercept standard Gemini generateContent for custom models
        const generateMatch = req.url.match(/\/(?:v1|v1beta)\/(models\/[^:]+):generateContent/);
        const streamMatch = req.url.match(/\/(?:v1|v1beta)\/(models\/[^:]+):streamGenerateContent/);
        if (req.method === 'POST' && (generateMatch || streamMatch)) {
            const matchedModelName = generateMatch ? generateMatch[1] : streamMatch[1];
            const customModels = loadCustomModels();
            const matched = customModels.find((m) => {
                const enumName = generateModelPlaceholderId(m);
                return m.name === matchedModelName || toSlug(m) === matchedModelName || m.displayName === matchedModelName || enumName === matchedModelName || 'models/' + enumName === matchedModelName;
            });
            if (matched) {
                try {
                    handleCustomModelRequest(res, matched, JSON.parse(fullBody.toString('utf-8')), !!streamMatch);
                    return;
                }
                catch {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    return;
                }
            }
        }
        // 5. Fallback: transparent proxy to Google
        proxyToGoogle(req, res, fullBody);
    });
}
// --- Server Start/Stop ---
function startProxy(port = 50998) {
    return new Promise((resolve, reject) => {
        server = http.createServer(handleRequest);
        server.listen(port, '127.0.0.1', () => {
            proxyPort = server.address().port;
            (0, shared_1.startCleanupInterval)();
            logger_1.log.info(`[Proxy] Listening on http://127.0.0.1:${proxyPort}`);
            resolve(proxyPort);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger_1.log.warn(`[Proxy] Port ${port} in use, falling back to dynamic port...`);
                console.warn(`[Warn] Port ${port} is busy, using dynamic port. Custom models may not appear in agy.`);
                console.warn(`[Warn] Close other instances or run: taskkill //F //IM agy.exe`);
                server.close();
                server.listen(0, '127.0.0.1', () => {
                    proxyPort = server.address().port;
                    (0, shared_1.startCleanupInterval)();
                    logger_1.log.info(`[Proxy] Listening on http://127.0.0.1:${proxyPort}`);
                    resolve(proxyPort);
                });
            }
            else {
                reject(err);
            }
        });
    });
}
function stopProxy() {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => { server = null; resolve(); });
        }
        else {
            resolve();
        }
    });
}
function getProxyPort() { return proxyPort; }
//# sourceMappingURL=proxy.js.map
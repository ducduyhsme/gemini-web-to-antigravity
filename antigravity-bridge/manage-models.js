const fs = require('fs');
const path = require('path');
const config = require('./dist/config.js');

const savedModelsFile = path.join(__dirname, 'saved_models.json');

function getSavedModels() {
    if (fs.existsSync(savedModelsFile)) {
        try {
            return JSON.parse(fs.readFileSync(savedModelsFile, 'utf8'));
        } catch {}
    }
    return { openai: [], claude: [] };
}

function saveSavedModels(data) {
    fs.writeFileSync(savedModelsFile, JSON.stringify(data, null, 2), 'utf8');
}

function handleAddSavedModel(providerType, modelId) {
    const data = getSavedModels();
    const key = providerType.toLowerCase().includes('claude') || providerType.toLowerCase().includes('anthropic') ? 'claude' : 'openai';
    if (!data[key]) data[key] = [];
    if (!data[key].includes(modelId)) {
        data[key].push(modelId);
        saveSavedModels(data);
    }
    return { success: true, saved: data[key] };
}

function handleRemoveSavedModel(providerType, modelId) {
    const data = getSavedModels();
    const key = providerType.toLowerCase().includes('claude') || providerType.toLowerCase().includes('anthropic') ? 'claude' : 'openai';
    if (data[key]) {
        data[key] = data[key].filter(m => m !== modelId);
        saveSavedModels(data);
    }
    return { success: true, saved: data[key] || [] };
}

function handleListModels() {
    return config.listModels();
}

function handleAddModel(modelData) {
    // Generate clean slug name if not provided
    const slug = 'custom-' + (modelData.externalModelName || modelData.name || 'model')
        .replace(/^models\//, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    const newModel = {
        name: slug,
        displayName: modelData.displayName || modelData.externalModelName || slug,
        description: modelData.description || `Custom ${modelData.provider} model for Antigravity`,
        provider: modelData.provider, // 'custom' (OpenAI-compatible) or 'anthropic'
        externalModelName: modelData.externalModelName,
        apiKey: modelData.apiKey,
        apiUrl: modelData.apiUrl,
        allowUnauthorized: modelData.allowUnauthorized || false
    };

    config.addModel(newModel);
    // Also save model ID to saved_models.json automatically
    handleAddSavedModel(modelData.provider, modelData.externalModelName);
    return { success: true, model: newModel };
}

function handleRemoveModel(name) {
    config.removeModel(name);
    return { success: true };
}

// CLI dispatcher
const args = process.argv.slice(2);
const command = args[0];

try {
    switch (command) {
        case 'list': {
            const models = handleListModels();
            console.log(JSON.stringify(models, null, 2));
            break;
        }
        case 'add': {
            let raw = args[1];
            if (raw && !raw.startsWith('{')) {
                // Try base64
                try {
                    raw = Buffer.from(raw, 'base64').toString('utf8');
                } catch {}
            }
            const data = JSON.parse(raw);
            const res = handleAddModel(data);
            console.log(JSON.stringify(res, null, 2));
            break;
        }
        case 'remove': {
            const name = args[1];
            const res = handleRemoveModel(name);
            console.log(JSON.stringify(res, null, 2));
            break;
        }
        case 'list-saved': {
            const provider = args[1] || '';
            const allSaved = getSavedModels();
            if (provider) {
                const key = provider.toLowerCase().includes('claude') || provider.toLowerCase().includes('anthropic') ? 'claude' : 'openai';
                console.log(JSON.stringify(allSaved[key] || [], null, 2));
            } else {
                console.log(JSON.stringify(allSaved, null, 2));
            }
            break;
        }
        case 'add-saved': {
            const provider = args[1];
            const modelId = args[2];
            const res = handleAddSavedModel(provider, modelId);
            console.log(JSON.stringify(res, null, 2));
            break;
        }
        case 'remove-saved': {
            const provider = args[1];
            const modelId = args[2];
            const res = handleRemoveSavedModel(provider, modelId);
            console.log(JSON.stringify(res, null, 2));
            break;
        }
        default:
            console.error(JSON.stringify({ error: `Unknown command: ${command}` }));
            process.exit(1);
    }
} catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
}

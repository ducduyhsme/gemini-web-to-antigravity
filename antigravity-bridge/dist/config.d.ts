export interface CustomModelEntry {
    name: string;
    displayName?: string;
    description?: string;
    provider: string;
    apiKey: string;
    apiUrl: string;
    externalModelName: string;
    allowUnauthorized?: boolean;
    encrypted?: boolean;
    timeout?: number;
    maxRetries?: number;
}
export declare function getConfigDir(): string;
export declare function getModelsPath(): string;
export declare function ensureConfigDir(): void;
export declare function loadModels(): CustomModelEntry[];
export declare function saveModels(models: CustomModelEntry[]): void;
export declare function addModel(model: CustomModelEntry): {
    success: boolean;
    error?: string;
};
export declare function removeModel(modelName: string): {
    success: boolean;
    error?: string;
};
export declare function getModel(modelName: string): CustomModelEntry | undefined;
export declare function listModels(): CustomModelEntry[];
//# sourceMappingURL=config.d.ts.map
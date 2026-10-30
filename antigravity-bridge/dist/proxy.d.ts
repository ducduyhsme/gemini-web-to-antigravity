export interface CustomModel {
    name: string;
    displayName: string;
    description: string;
    provider: string;
    apiKey: string;
    apiUrl: string;
    externalModelName: string;
    allowUnauthorized?: boolean;
    encrypted?: boolean;
    _slug?: string;
    timeout?: number;
    maxRetries?: number;
}
export declare function generateModelPlaceholderId(model: CustomModel): string;
export declare function getCustomModelsPath(): string;
export declare function toSlug(model: CustomModel): string;
export declare function loadCustomModels(): CustomModel[];
export declare function startProxy(port?: number): Promise<number>;
export declare function stopProxy(): Promise<void>;
export declare function getProxyPort(): number;
//# sourceMappingURL=proxy.d.ts.map
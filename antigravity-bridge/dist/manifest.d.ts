export interface PatchStrategy {
    agyVersionRange?: string;
    urls: {
        orig: string;
        repl: string;
    }[];
    notes?: string;
}
export interface PatchManifest {
    lastUpdated: string;
    latestKnownAgyVersion?: string;
    strategies: PatchStrategy[];
}
/**
 * Load the best available patch manifest:
 * 1. Try remote (GitHub raw) if online
 * 2. Fall back to local cache
 * 3. Fall back to bundled manifest in package
 */
export declare function loadPatchManifest(): Promise<PatchManifest | null>;
/**
 * Check whether the currently installed agy version is known/tested.
 * Warns the user if it is newer than the latest known version.
 */
export declare function checkAgyCompatibility(currentVersion: string): Promise<void>;
//# sourceMappingURL=manifest.d.ts.map
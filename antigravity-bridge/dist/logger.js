"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const isDebug = () => process.env.ANTIGRAVITY_DEBUG === 'true';
exports.log = {
    info: ((message, ...args) => {
        if (isDebug())
            console.log(`[INFO] ${message}`, ...args);
    }),
    warn: ((message, ...args) => {
        // Warnings are kept visible but styled
        console.warn(`[WARN] ${message}`, ...args);
    }),
    error: ((message, ...args) => {
        // Errors are always critical and visible
        console.error(`[ERROR] ${message}`, ...args);
    }),
    debug: ((message, ...args) => {
        if (isDebug())
            console.debug(`[DEBUG] ${message}`, ...args);
    }),
};
//# sourceMappingURL=logger.js.map
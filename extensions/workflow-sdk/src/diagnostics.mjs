// Diagnostics are bounded JSON data; they never evaluate or modify candidate code.
export const pointer = (base, key) => base + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1');
export function preview(value, depth = 0) {
    if (value === undefined) return { missing: true };
    if (typeof value === 'string' && value.length > 256) return { text: value.slice(0, 256), length: value.length, truncated: true };
    if (!value || typeof value !== 'object') return Number.isFinite(value) || typeof value !== 'number' ? value : String(value);
    if (depth >= 3) return { type: Array.isArray(value) ? 'array' : 'object', truncated: true };
    if (Array.isArray(value)) return value.length <= 8 ? value.map(item => preview(item, depth + 1))
        : { items: value.slice(0, 8).map(item => preview(item, depth + 1)), length: value.length, truncated: true };
    const keys = Object.keys(value).sort();
    return keys.length <= 8 ? Object.fromEntries(keys.map(key => [key, preview(value[key], depth + 1)]))
        : { properties: Object.fromEntries(keys.slice(0, 8).map(key => [key, preview(value[key], depth + 1)])), truncated: true };
}
export class ValidationError extends Error {
    constructor(message, issues, truncated = false) { super(message); this.name = 'ValidationError';
        this.code = 'SCHEMA_INVALID'; this.issues = issues; this.truncated = truncated; }
}
export function errorDiagnostic(error) {
    const code=error.code ?? 'CONTRACT_ERROR';
    const hints={TASK_TIMEOUT:'Finish within the existing timeout; use bounded work and keep the declared limits.',
        TASK_OUTPUT_LIMIT:'Reduce output and logs to the existing byte budget; reserve stdout for the JSON protocol.',
        TASK_PROCESS_FAILED:'Fix the task runtime failure shown in the bounded error message; keep permissions and budgets.',
        PROTOCOL_INVALID_JSON:'Return a JSON result from the exported function and do not write logs to stdout.'};
    return { code: error.code ?? 'CONTRACT_ERROR', message: String(error.message).slice(0, 2048),
        issues: error.issues ?? (hints[code] ? [{code,path:'',hint:hints[code]}] : []), truncated: error.truncated ?? false };
}
export function jsonEqual(a, b, depth = 0) {
    if (a === b) return true;
    if (depth > 32 || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a).sort(), other = Object.keys(b).sort();
    return keys.length === other.length && keys.every((key, i) => key === other[i] && jsonEqual(a[key], b[key], depth + 1));
}
export function compareJSON(expected, actual, maxIssues = 24) {
    if (!Number.isInteger(maxIssues) || maxIssues < 1 || maxIssues > 64) throw new RangeError('Expected 1..64 diagnostic issues');
    const issues = []; let truncated = false;
    const add = (code, path, a, b, hint, details = {}) => {
        if (issues.length >= maxIssues) { truncated = true; return; }
        issues.push({ code, path, expected: preview(a), actual: preview(b), hint, ...details });
    };
    const walk = (a, b, path, depth) => {
        if (jsonEqual(a, b)) return;
        if (depth > 32) { add('DEPTH_LIMIT', path, a, b, 'Reduce nesting to the supported contract.'); return; }
        if (a === undefined) { add('UNEXPECTED_FIELD', path, a, b, 'Remove the field or item absent from the expected output.'); return; }
        if (b === undefined) { add('MISSING_FIELD', path, a, b, 'Return the required field or item.'); return; }
        if (Array.isArray(a) && Array.isArray(b)) {
            const used = new Set();
            const reordered = a.length <= 256 && a.length === b.length && a.every(item => {
                const index = b.findIndex((other, i) => !used.has(i) && jsonEqual(item, other));
                if (index < 0) return false; used.add(index); return true;
            });
            if (reordered) { add('ARRAY_ORDER', path, a, b, 'Return items in the order required by the contract.'); return; }
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                if (issues.length >= maxIssues) { truncated = true; break; }
                walk(a[i], b[i], pointer(path, i), depth + 1);
            }
        } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
            for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
                if (issues.length >= maxIssues) { truncated = true; break; }
                walk(a[key], b[key], pointer(path, key), depth + 1);
            }
        } else {
            const details = {};
            if (typeof a === 'string' && typeof b === 'string') {
                let offset = 0; while (offset < Math.min(a.length, b.length) && a[offset] === b[offset]) offset++;
                details.firstDifference = { utf16Offset: offset, expectedCodePoint: a.codePointAt(offset) ?? null, actualCodePoint: b.codePointAt(offset) ?? null };
            }
            const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
            add(kind(a) === kind(b) ? 'VALUE_MISMATCH' : 'TYPE_MISMATCH', path, a, b,
                'Return the exact value required by the external fixture; correct the implementation.', details);
        }
    };
    walk(expected, actual, '', 0);
    return { issues, truncated };
}

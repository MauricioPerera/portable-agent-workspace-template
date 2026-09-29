import { createHash } from 'node:crypto';
import { checkSchema, validateValue, compatible, schemaAt, insist, exactKeys, ID } from './schema.mjs';
export function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    const text = JSON.stringify(value);
    insist(text !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'Only JSON values are supported');
    return text;
}
export const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const ref = path => ({ $ref: path });
export function defineTask(value) { validateTask(value); return JSON.parse(canonical(value)); }
export function defineFlow(value) { validateFlow(value); return JSON.parse(canonical(value)); }
function validateTask(task) {
    exactKeys(task, ['id', 'language', 'source', 'input', 'output', 'permissions', 'limits'], 'task');
    insist(ID.test(task.id), 'Invalid task ID');
    insist(task.language === 'javascript', 'Only javascript tasks are supported');
    insist(typeof task.source === 'string' && task.source.length > 0 && Buffer.byteLength(task.source) <= 65536, 'Task source must be 1..65536 bytes');
    checkSchema(task.input); checkSchema(task.output);
    exactKeys(task.permissions, ['network', 'filesystem'], 'permissions');
    insist(task.permissions.network === false && task.permissions.filesystem === false, 'This profile only permits tasks without network or filesystem access');
    exactKeys(task.limits, ['timeoutMs', 'memoryMb', 'outputBytes'], 'limits');
    for (const [key, min, max] of [['timeoutMs', 100, 10000], ['memoryMb', 64, 512], ['outputBytes', 1024, 262144]])
        insist(Number.isInteger(task.limits[key]) && task.limits[key] >= min && task.limits[key] <= max, `Invalid limit ${key}`);
}
function reference(path, available) {
    insist(typeof path === 'string', 'Invalid reference');
    const [name, ...keys] = path.split('.');
    insist(Object.hasOwn(available, name), 'Forward or unknown reference: ' + name);
    return schemaAt(available[name], keys);
}
function checkBinding(value, schema, available) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, '$ref')) {
        exactKeys(value, ['$ref'], 'reference'); compatible(reference(value.$ref, available), schema); return;
    }
    if (schema.type === 'object') {
        insist(value && typeof value === 'object' && !Array.isArray(value), 'Object binding required');
        insist(Object.keys(value).every(key => Object.hasOwn(schema.properties, key)), 'Unexpected binding property');
        insist(schema.required.every(key => Object.hasOwn(value, key)), 'Missing binding property');
        for (const [key, item] of Object.entries(value)) checkBinding(item, schema.properties[key], available);
    } else if (schema.type === 'array') {
        insist(Array.isArray(value), 'Array binding required');
        insist(schema.maxItems === undefined || value.length <= schema.maxItems, 'Too many binding items');
        value.forEach(item => checkBinding(item, schema.items, available));
    } else validateValue(value, schema, 'literal');
}
export function validateFlow(flow) {
    insist(Buffer.byteLength(canonical(flow)) <= 1048576, 'Flow exceeds 1 MiB');
    exactKeys(flow, ['schemaVersion', 'id', 'objective', 'input', 'tasks', 'steps', 'output', 'outputSchema'], 'flow');
    insist(flow.schemaVersion === 1 && ID.test(flow.id), 'Invalid flow version or ID');
    insist(typeof flow.objective === 'string' && flow.objective.length > 0 && flow.objective.length <= 2000, 'Objective required');
    checkSchema(flow.input); checkSchema(flow.outputSchema);
    insist(Array.isArray(flow.tasks) && flow.tasks.length > 0 && flow.tasks.length <= 16, 'Expected 1..16 tasks');
    const tasks = {};
    for (const task of flow.tasks) { validateTask(task); insist(!Object.hasOwn(tasks, task.id), 'Duplicate task'); tasks[task.id] = task; }
    insist(Array.isArray(flow.steps) && flow.steps.length > 0 && flow.steps.length <= 32, 'Expected 1..32 steps');
    const available = { input: flow.input };
    const used = new Set();
    for (const step of flow.steps) {
        exactKeys(step, ['id', 'task', 'with'], 'step');
        insist(ID.test(step.id) && !Object.hasOwn(available, step.id) && !['trigger', 'constructor', 'prototype', '__proto__'].includes(step.id), 'Duplicate or invalid step ID');
        insist(Object.hasOwn(tasks, step.task), 'Unknown task');
        checkBinding(step.with, tasks[step.task].input, available);
        available[step.id] = tasks[step.task].output;
        used.add(step.task);
    }
    insist(used.size === flow.tasks.length, 'Unused task is not accepted');
    checkBinding(flow.output, flow.outputSchema, available);
    return flow;
}
export function resolveBinding(value, outputs) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, '$ref')) {
        const [name, ...keys] = value.$ref.split('.');
        let result = outputs[name];
        for (const key of keys) { insist(result && Object.hasOwn(result, key), 'Missing reference output'); result = result[key]; }
        return result;
    }
    if (Array.isArray(value)) return value.map(item => resolveBinding(item, outputs));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveBinding(item, outputs)]));
    return value;
}

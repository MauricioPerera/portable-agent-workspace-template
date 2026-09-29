import { ValidationError, preview, pointer, jsonEqual } from './diagnostics.mjs';
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const KEYS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'maxItems']);
export const ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
export function insist(condition, message) { if (!condition) throw new Error(message); }
export function exactKeys(value, keys, at) {
    insist(value && typeof value === 'object' && !Array.isArray(value), `${at}: expected object`);
    const unsupported = Object.keys(value).filter(key => !keys.includes(key)).sort();
    insist(unsupported.length === 0, `${at}: unsupported field: ${unsupported.join(', ')}; allowed: ${keys.join(', ')}`);
}
export function checkSchema(schema, at = 'schema', depth = 0) {
    insist(depth < 16, `${at}: schema too deep`);
    exactKeys(schema, [...KEYS], at);
    insist(TYPES.has(schema.type), `${at}: unsupported type`);
    const relevant = {
        object: ['properties', 'required', 'additionalProperties'], array: ['items', 'maxItems'],
        string: ['minLength', 'maxLength'], number: ['minimum', 'maximum'], integer: ['minimum', 'maximum'],
    }[schema.type] ?? [];
    insist(Object.keys(schema).every(key => ['type', 'enum', ...relevant].includes(key)), `${at}: keyword incompatible with type`);
    if (schema.type === 'object') {
        insist(schema.additionalProperties === false, `${at}: additionalProperties must be false`);
        exactKeys(schema.properties, Object.keys(schema.properties ?? {}), at + '.properties');
        insist(Array.isArray(schema.required) && new Set(schema.required).size === schema.required.length, `${at}: required must be a unique array`);
        insist(schema.required.every(key => Object.hasOwn(schema.properties, key)), `${at}: unknown required property`);
        for (const [key, child] of Object.entries(schema.properties)) {
            insist(ID.test(key) && !['constructor', 'prototype', '__proto__'].includes(key), `${at}: invalid property name`);
            checkSchema(child, `${at}.${key}`, depth + 1);
        }
    }
    if (schema.type === 'array') checkSchema(schema.items, at + '[]', depth + 1);
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'maxItems']) {
        if (Object.hasOwn(schema, key)) insist(Number.isFinite(schema[key]) && (!key.includes('Length') && key !== 'maxItems' || Number.isInteger(schema[key]) && schema[key] >= 0), `${at}: invalid ${key}`);
    }
    if (schema.minimum !== undefined && schema.maximum !== undefined) insist(schema.minimum <= schema.maximum, `${at}: inverted bounds`);
    if (schema.minLength !== undefined && schema.maxLength !== undefined) insist(schema.minLength <= schema.maxLength, `${at}: inverted length bounds`);
    if (schema.enum !== undefined) {
        insist(Array.isArray(schema.enum) && schema.enum.length > 0, `${at}: empty enum`);
        const withoutEnum = { ...schema }; delete withoutEnum.enum;
        for (const value of schema.enum) validateValue(value, withoutEnum, at + '.enum');
    }
    return schema;
}
export function inspectValue(value, schema, { maxIssues = 64, depth = 0 } = {}) {
    insist(Number.isInteger(maxIssues) && maxIssues >= 1 && maxIssues <= 64, 'Invalid diagnostic issue limit');
    const issues = []; let truncated = false;
    const add = (code, path, message, expected, actual, hint) => {
        if (issues.length >= maxIssues) { truncated = true; return; }
        issues.push({code,path,message,expected:preview(expected),actual:preview(actual),hint});
    };
    const visit = (value, schema, path, depth) => {
        if (issues.length >= maxIssues) { truncated = true; return; }
        if (depth >= 32) { add('DEPTH_LIMIT',path,'value too deep',31,depth,'Reduce nesting.'); return; }
        const matches = {object:value !== null && typeof value === 'object' && !Array.isArray(value),array:Array.isArray(value),
            string:typeof value === 'string',number:typeof value === 'number' && Number.isFinite(value),integer:Number.isInteger(value),
            boolean:typeof value === 'boolean',null:value === null};
        if (!matches[schema.type]) { add('TYPE_MISMATCH',path,'expected '+schema.type,schema.type,value,'Return a value of the declared type.'); return; }
        if (schema.enum && !schema.enum.some(item => jsonEqual(item,value))) add('ENUM_MISMATCH',path,'outside enum',schema.enum,value,'Use one of the allowed enum values.');
        if (schema.type === 'object') {
            for (const key of Object.keys(value).filter(key => !Object.hasOwn(schema.properties,key)).sort())
                add('UNEXPECTED_FIELD',pointer(path,key),'unexpected property',undefined,value[key],'Remove this undeclared property.');
            for (const key of [...schema.required].sort()) if (!Object.hasOwn(value,key))
                add('MISSING_FIELD',pointer(path,key),'missing '+key,schema.properties[key].type,undefined,'Return this required property.');
            for (const key of Object.keys(value).filter(key => Object.hasOwn(schema.properties,key)).sort()) visit(value[key],schema.properties[key],pointer(path,key),depth+1);
        }
        if (schema.type === 'array') {
            if (schema.maxItems !== undefined && value.length > schema.maxItems) add('MAX_ITEMS',path,'too many items',schema.maxItems,value.length,'Reduce the array length.');
            for (let i=0;i<value.length;i++) { if(issues.length>=maxIssues){truncated=true;break;} visit(value[i],schema.items,pointer(path,i),depth+1); }
        }
        if (schema.type === 'string') {
            if (schema.minLength !== undefined && value.length < schema.minLength) add('MIN_LENGTH',path,'too short',schema.minLength,value.length,'Return a string meeting the minimum length.');
            if (schema.maxLength !== undefined && value.length > schema.maxLength) add('MAX_LENGTH',path,'too long',schema.maxLength,value.length,'Return a string within the maximum length.');
        }
        if (schema.type === 'number' || schema.type === 'integer') {
            if (schema.minimum !== undefined && value < schema.minimum) add('MINIMUM',path,'below minimum',schema.minimum,value,'Meet the lower numeric bound.');
            if (schema.maximum !== undefined && value > schema.maximum) add('MAXIMUM',path,'above maximum',schema.maximum,value,'Meet the upper numeric bound.');
        }
    };
    visit(value,schema,'',depth);
    return {valid:issues.length===0,issues,truncated};
}
export function validateValue(value, schema, at = 'value', depth = 0) {
    const result = inspectValue(value,schema,{depth});
    if (!result.valid) throw new ValidationError(`${at}${result.issues[0].path}: ${result.issues[0].message}`,result.issues,result.truncated);
    return value;
}
export function schemaAt(schema, path) {
    for (const key of path) {
        insist(schema.type === 'object' && Object.hasOwn(schema.properties, key), 'Reference to unknown property');
        insist(schema.required.includes(key), 'Reference to optional property is not supported');
        schema = schema.properties[key];
    }
    return schema;
}
export function compatible(source, target) {
    insist(source.type === target.type || source.type === 'integer' && target.type === 'number', 'Reference type mismatch');
    if (target.enum) insist(source.enum && source.enum.every(item => target.enum.some(other => jsonEqual(item,other))), 'Reference enum is not contained');
    for (const key of ['minimum', 'minLength']) if (target[key] !== undefined) insist(source[key] !== undefined && source[key] >= target[key], 'Reference lower bound is not guaranteed');
    for (const key of ['maximum', 'maxLength', 'maxItems']) if (target[key] !== undefined) insist(source[key] !== undefined && source[key] <= target[key], 'Reference upper bound is not guaranteed');
    if (target.type === 'object') {
        insist(Object.keys(source.properties).every(key => Object.hasOwn(target.properties, key)), 'Reference contains extra properties');
        insist(target.required.every(key => source.required.includes(key)), 'Reference misses required properties');
        for (const key of Object.keys(source.properties)) compatible(source.properties[key], target.properties[key]);
    }
    if (target.type === 'array') compatible(source.items, target.items);
}

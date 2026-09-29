import { createHash } from 'node:crypto';
export const LABELS = ['urgente', 'normal', 'revisión'];
const digest = text => createHash('sha256').update(text).digest('hex');
export const normalizeText = text => text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
function check(condition, message) { if (!condition) throw new Error(message); }

export function parseDataset(text) {
    check(Buffer.byteLength(text) <= 1048576, 'Dataset exceeds 1 MiB');
    const records = [], ids = new Set(), texts = new Set();
    for (const [i, line] of text.replace(/^\uFEFF/u, '').split(/\r?\n/u).entries()) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        check(row && !Array.isArray(row) && typeof row === 'object', 'Expected JSON object at line ' + (i + 1));
        check(Object.keys(row).length === 3 && ['id', 'texto', 'categoria_esperada'].every(key => Object.hasOwn(row, key)), 'Expected id, texto and categoria_esperada');
        check(typeof row.id === 'string' && row.id.length >= 1 && row.id.length <= 64, 'Invalid dataset ID');
        check(typeof row.texto === 'string' && row.texto.length <= 4096, 'Invalid dataset text');
        check(LABELS.includes(row.categoria_esperada), 'Unknown dataset label');
        const normalizedHash = digest(normalizeText(row.texto));
        check(!ids.has(row.id), 'Duplicate dataset ID: ' + row.id);
        check(!texts.has(normalizedHash), 'Duplicate normalized text: ' + row.id);
        ids.add(row.id); texts.add(normalizedHash); records.push(row);
    }
    check(records.length >= 1 && records.length <= 500, 'Expected 1..500 dataset records');
    return records;
}
export function checkEvaluationCriteria(criteria) {
    check(criteria && !Array.isArray(criteria) && typeof criteria === 'object', 'Expected evaluation criteria');
    const keys = ['minAccuracy', 'minUrgentRecall', 'maxReviewRate', 'minPerCategory', 'maxRuntimeErrors'];
    check(Object.keys(criteria).length === keys.length && keys.every(key => Object.hasOwn(criteria, key)), 'Unknown or missing evaluation criterion');
    for (const key of ['minAccuracy', 'minUrgentRecall', 'maxReviewRate']) check(Number.isFinite(criteria[key]) && criteria[key] >= 0 && criteria[key] <= 1, 'Invalid ' + key);
    check(Number.isInteger(criteria.minPerCategory) && criteria.minPerCategory >= 1 && criteria.minPerCategory <= 500, 'Invalid minPerCategory');
    check(Number.isInteger(criteria.maxRuntimeErrors) && criteria.maxRuntimeErrors >= 0 && criteria.maxRuntimeErrors <= 500, 'Invalid maxRuntimeErrors');
    return criteria;
}
export function rejectFixtureOverlap(records, policy) {
    const examples = [...Object.values(policy.taskCases).flat(), ...policy.flowCases];
    const texts = new Set(examples.map(item => item.input?.texto ?? item.input?.texto_normalizado)
        .filter(value => typeof value === 'string').map(value => digest(normalizeText(value))));
    for (const row of records) check(!texts.has(digest(normalizeText(row.texto))), 'Evaluation text duplicates acceptance fixture: ' + row.id);
}
export function summarize(results, criteria) {
    checkEvaluationCriteria(criteria);
    check(results.length > 0, 'No evaluation results');
    const matrix = Object.fromEntries(LABELS.map(label => [label, Object.fromEntries([...LABELS, 'error'].map(other => [other, 0]))]));
    for (const row of results) {
        check(LABELS.includes(row.expected) && (LABELS.includes(row.predicted) || row.predicted === 'error'), 'Invalid evaluation result');
        matrix[row.expected][row.predicted]++;
    }
    const perCategory = {};
    for (const label of LABELS) {
        const tp = matrix[label][label];
        const support = Object.values(matrix[label]).reduce((a, b) => a + b, 0);
        const predicted = LABELS.reduce((total, actual) => total + matrix[actual][label], 0);
        const fp = predicted - tp, fn = support - tp;
        perCategory[label] = { support, predicted, truePositives: tp, falsePositives: fp, falseNegatives: fn,
            precision: predicted ? tp / predicted : null, recall: support ? tp / support : null,
            f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null };
    }
    const correct = LABELS.reduce((sum, label) => sum + matrix[label][label], 0);
    const runtimeErrors = LABELS.reduce((sum, label) => sum + matrix[label].error, 0);
    const reviewCount = LABELS.reduce((sum, label) => sum + matrix[label]['revisión'], 0);
    const accuracy = correct / results.length, reviewRate = reviewCount / results.length;
    const checks = {
        accuracy: accuracy >= criteria.minAccuracy,
        urgentRecall: perCategory.urgente.recall !== null && perCategory.urgente.recall >= criteria.minUrgentRecall,
        reviewRate: reviewRate <= criteria.maxReviewRate,
        categoryCoverage: LABELS.every(label => perCategory[label].support >= criteria.minPerCategory),
        runtimeErrors: runtimeErrors <= criteria.maxRuntimeErrors
    };
    return { count: results.length, correct, runtimeErrors, accuracy, reviewCount, reviewRate,
        confusionMatrix: matrix, matrixOrientation: 'expected rows, predicted columns; error is a runtime failure',
        perCategory, criteria, checks, accepted: Object.values(checks).every(Boolean) };
}

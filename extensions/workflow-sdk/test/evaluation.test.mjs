import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataset, rejectFixtureOverlap, summarize } from '../examples/text-classification/evaluation.mjs';
const criteria = { minAccuracy: 0.9, minUrgentRecall: 1, maxReviewRate: 0.5, minPerCategory: 1, maxRuntimeErrors: 0 };
const rows = [
    { expected: 'urgente', predicted: 'normal' },
    { expected: 'normal', predicted: 'normal' },
    { expected: 'revisión', predicted: 'revisión' }
];
test('Missed urgency fails the quality gate even if other classes are correct', () => {
    const summary = summarize(rows, criteria);
    assert.equal(summary.confusionMatrix.urgente.normal, 1);
    assert.equal(summary.perCategory.urgente.recall, 0);
    assert.equal(summary.perCategory.normal.precision, 0.5);
    assert.equal(summary.perCategory.normal.f1, 2 / 3);
    assert.equal(summary.accuracy, 2 / 3);
    assert.equal(summary.accepted, false);
    assert.equal(summary.checks.urgentRecall, false);
});
test('Runtime failures count as errors and missed predictions', () => {
    const summary = summarize([{ expected: 'urgente', predicted: 'error' }, ...rows.slice(1)], criteria);
    assert.equal(summary.count, 3); assert.equal(summary.runtimeErrors, 1);
    assert.equal(summary.perCategory.urgente.falseNegatives, 1);
    assert.equal(summary.accuracy, 2 / 3);
    assert.equal(summary.checks.runtimeErrors, false);
});
test('Missing classes cannot meet coverage or urgent recall criteria', () => {
    const summary = summarize([{ expected: 'normal', predicted: 'normal' }], criteria);
    assert.equal(summary.perCategory.urgente.recall, null);
    assert.equal(summary.accepted, false);
    assert.equal(summary.checks.categoryCoverage, false);
});
test('All-correct representative results meet the declared criteria', () => {
    assert.equal(summarize(rows.map(row => ({ ...row, predicted: row.expected })), criteria).accepted, true);
});
test('Rejects duplicates, unknown labels and unexpected fields', () => {
    const row = { id: 'a', texto: ' URGENTE ', categoria_esperada: 'urgente' };
    const parsed = parseDataset(JSON.stringify(row)); assert.equal(parsed[0].id, 'a');
    assert.throws(() => parseDataset([row, { ...row, id: 'b', texto: 'urgente' }].map(JSON.stringify).join('\n')), /Duplicate normalized/);
    assert.throws(() => parseDataset([row, { ...row, texto: 'otro' }].map(JSON.stringify).join('\n')), /Duplicate dataset ID/);
    assert.throws(() => parseDataset(JSON.stringify({ ...row, categoria_esperada: 'revision' })), /Unknown dataset label/);
    assert.throws(() => parseDataset(JSON.stringify({ ...row, extra: 1 })), /Expected id/);
});
test('Rejects normalized overlap with external acceptance fixtures', () => {
    assert.throws(() => rejectFixtureOverlap([{ id: 'a', texto: '  HOLA\tMUNDO ' }], {
        taskCases: { normalizar: [{ input: { texto: 'hola mundo' } }] }, flowCases: []
    }), /duplicates acceptance/);
});

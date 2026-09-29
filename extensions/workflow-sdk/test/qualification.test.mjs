import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { qualifyClassifier, executeQualified } from '../examples/text-classification/qualification.mjs';

const base = new URL('../examples/text-classification/', import.meta.url);
const spec = JSON.parse(await readFile(new URL('flow.json', base)));
const policy = JSON.parse(await readFile(new URL('policy.json', base)));
const criteria = JSON.parse(await readFile(new URL('evaluation-criteria.json', base)));
const datasetText = await readFile(new URL('dataset-ilustrativo.jsonl', base), 'utf8');
const linux = { skip: process.platform !== 'linux' };
const parameters = directory => ({ spec: structuredClone(spec), policy, criteria, datasetText, kind: 'ilustrativo',
    registryDirectory: join(directory, 'registry'), outputDirectory: join(directory, 'qualification') });

test('Rejects a candidate that fails functional cases before publication', linux, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-functional-gate-'));
    try {
        const input = parameters(directory);
        input.spec.tasks.find(task => task.id === 'clasificar').source = 'module.exports=()=>({categoria:"normal",requiere_revision:false,reglas_aplicadas:[]});';
        const result = await qualifyClassifier(input);
        assert.equal(result.status, 'REJECTED'); assert.equal(result.stage, 'functional'); assert.equal(result.artifactId, null);
        await assert.rejects(access(input.registryDirectory), /ENOENT/);
        await assert.rejects(access(join(input.outputDirectory, 'release.json')), /ENOENT/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Passing functional tests cannot bypass a failed dataset evaluation', linux, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-dataset-gate-'));
    try {
        const input = parameters(directory);
        const task = input.spec.tasks.find(task => task.id === 'clasificar');
        // Deliberate mutation: misses this wording, while still passing all functional fixtures.
        const needle = 'inmediato|inmediata|inmediatamente';
        assert(task.source.includes(needle));
        task.source = task.source.replace(needle, 'inmediato|(?<!respuesta )inmediata|inmediatamente');
        const result = await qualifyClassifier(input);
        assert.equal(result.status, 'REJECTED'); assert.equal(result.stage, 'evaluation'); assert.equal(result.artifactId, null);
        const functional = JSON.parse(await readFile(join(input.outputDirectory, 'functional.json')));
        const evaluation = JSON.parse(await readFile(join(input.outputDirectory, 'evaluation.json')));
        assert.equal(functional.accepted, true); assert.equal(functional.cases.length, 28);
        assert.equal(evaluation.metrics.accepted, false); assert.equal(evaluation.metrics.perCategory.urgente.recall, 0.5);
        await assert.rejects(access(input.registryDirectory), /ENOENT/);
        await assert.rejects(access(join(input.outputDirectory, 'release.json')), /ENOENT/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Only qualified releases run; experimental opt-in, recovery and integrity are enforced', linux, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-qualified-release-'));
    try {
        const input = parameters(directory);
        const result = await qualifyClassifier(input);
        assert.equal(result.status, 'ACCEPTED'); assert.equal(result.releaseLevel, 'experimental'); assert(result.artifactId);
        const run = { qualificationDirectory: input.outputDirectory, registryDirectory: input.registryDirectory,
            input: { id: 'qualified-001', texto: 'Necesito una respuesta inmediata.' }, stateDirectory: join(directory, 'execution'), runId: 'qualified-run' };
        await assert.rejects(executeQualified(run), /Experimental release/);
        const output = await executeQualified({ ...run, allowExperimental: true });
        assert.equal(output.output.categoria, 'urgente'); assert.equal(output.invocations.length, 2);
        const recovered = await executeQualified({ ...run, allowExperimental: true, resume: true });
        assert.deepEqual(recovered.output, output.output); assert.equal(recovered.invocations.length, 0);
        assert.equal(recovered.snapshotHash, output.snapshotHash);
        const criteriaFile = join(input.outputDirectory, 'criteria.json');
        await writeFile(criteriaFile, (await readFile(criteriaFile, 'utf8')) + ' ');
        await assert.rejects(executeQualified({ ...run, allowExperimental: true, resume: true }), /tampered/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

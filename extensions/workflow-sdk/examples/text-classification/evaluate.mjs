import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { executeArtifact, loadArtifact } from '../../src/index.mjs';
import { parseDataset, checkEvaluationCriteria, rejectFixtureOverlap, summarize, LABELS } from './evaluation.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
async function main() {
    const allowed = ['--dataset', '--criteria', '--kind', '--registry', '--artifact', '--state', '--output'];
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
        const key = process.argv[i];
        if (!allowed.includes(key) || !process.argv[i + 1] || options[key]) throw new Error('Invalid evaluator argument');
        options[key] = process.argv[i + 1];
    }
    if (!allowed.every(key => options[key])) throw new Error('Required: dataset, criteria, kind, registry, artifact, state, output');
    if (!['real', 'ilustrativo'].includes(options['--kind'])) throw new Error('--kind must be real or ilustrativo');
    const datasetBytes = await readFile(options['--dataset']);
    const criteriaBytes = await readFile(options['--criteria']);
    const records = parseDataset(datasetBytes.toString());
    const criteria = checkEvaluationCriteria(JSON.parse(criteriaBytes));
    const artifact = await loadArtifact({ registryDirectory: options['--registry'], artifactId: options['--artifact'] });
    if (artifact.spec.id !== 'clasificar-textos') throw new Error('Expected priority classification artifact');
    rejectFixtureOverlap(records, artifact.policy);
    const evaluationId = randomUUID(), results = [];
    const started = performance.now();
    for (const [i, record] of records.entries()) {
        const runId = 'e-' + evaluationId + '-' + i;
        const recordStarted = performance.now();
        let output, error;
        try {
            const execution = await executeArtifact({ registryDirectory: options['--registry'], artifactId: options['--artifact'],
                stateDirectory: options['--state'], runId, input: { id: record.id, texto: record.texto } });
            output = execution.output;
            if (output.id !== record.id || !LABELS.includes(output.categoria) || output.requiere_revision !== (output.categoria === 'revisión')) throw new Error('Classifier output violates evaluation contract');
        } catch (failure) { error = String(failure.message).slice(0, 2048); }
        results.push({ id: record.id, runId, textHash: hash(record.texto), expected: record.categoria_esperada,
            predicted: error ? 'error' : output.categoria, rules: error ? [] : output.reglas_aplicadas,
            elapsedMs: performance.now() - recordStarted, error: error ?? null });
        if ((i + 1) % 25 === 0) console.error('Evaluated ' + (i + 1) + '/' + records.length);
    }
    const metrics = summarize(results, criteria);
    const report = { schemaVersion: 1, evaluationId, createdAt: new Date().toISOString(),
        dataset: { path: resolve(options['--dataset']), sha256: hash(datasetBytes), declaredKind: options['--kind'], records: records.length },
        criteriaHash: hash(criteriaBytes), artifactId: options['--artifact'], runtimeIdentity: artifact.report.identity,
        evaluatorHash: hash(await readFile(new URL(import.meta.url))), metricsHash: hash(await readFile(new URL('./evaluation.mjs', import.meta.url))),
        elapsedMs: performance.now() - started, metrics, results,
        mismatches: results.filter(row => row.predicted !== row.expected) };
    await mkdir(dirname(resolve(options['--output'])), { recursive: true });
    await writeFile(options['--output'], JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ accepted: metrics.accepted, declaredKind: options['--kind'], metrics, report: options['--output'] }, null, 2));
    process.exitCode = metrics.accepted ? 0 : 2;
}
main().catch(error => { console.error('ERROR: ' + error.message); process.exitCode = 1; });

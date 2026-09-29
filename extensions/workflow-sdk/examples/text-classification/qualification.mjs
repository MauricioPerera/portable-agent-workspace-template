import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verify, publish, loadArtifact, executeArtifact, runtimeIdentity } from '../../src/index.mjs';
import { runFlow, safeDirectory } from '../../src/runtime.mjs';
import { sha, canonical } from '../../src/definition.mjs';
import { insist } from '../../src/schema.mjs';
import { parseDataset, checkEvaluationCriteria, rejectFixtureOverlap, summarize, LABELS } from './evaluation.mjs';

const FILES = ['spec.json', 'policy.json', 'dataset.jsonl', 'criteria.json', 'functional.json', 'evaluation.json', 'result.json'];
async function qualifierIdentity() {
    return { profile: 'priority-classification-v1',
        qualification: sha(await readFile(new URL(import.meta.url))),
        metrics: sha(await readFile(new URL('./evaluation.mjs', import.meta.url))) };
}
async function createFile(directory, name, value, raw = false) {
    await writeFile(join(directory, name), raw ? value : canonical(value), { flag: 'wx', mode: 0o600 });
}
export async function qualifyClassifier({ spec, policy, datasetText, criteria, kind, outputDirectory, registryDirectory }) {
    insist(['real', 'ilustrativo'].includes(kind), 'Unknown dataset kind');
    const records = parseDataset(datasetText);
    checkEvaluationCriteria(criteria);
    insist(spec.id === 'clasificar-textos', 'Expected classification candidate');
    rejectFixtureOverlap(records, policy);
    const parent = await safeDirectory(resolve(outputDirectory, '..'));
    const output = join(parent, resolve(outputDirectory).split(/[\\/]/).at(-1));
    await mkdir(output, { mode: 0o700 }); // Existing qualifications must not be overwritten.
    const identity = await qualifierIdentity();
    const result = { schemaVersion: 1, qualificationId: randomUUID(), createdAt: new Date().toISOString(),
        status: 'RUNNING', stage: 'functional', kind, releaseLevel: kind === 'ilustrativo' ? 'experimental' : 'evaluated-real-data',
        specHash: sha(spec), policyHash: sha(policy), datasetHash: sha(datasetText), criteriaHash: sha(criteria),
        qualifierIdentity: identity, artifactId: null, registryDirectory: resolve(registryDirectory) };
    await createFile(output, 'spec.json', spec); await createFile(output, 'policy.json', policy);
    await createFile(output, 'dataset.jsonl', datasetText, true); await createFile(output, 'criteria.json', criteria);
    try {
        const functional = await verify({ spec, policy });
        await createFile(output, 'functional.json', functional);
        if (!functional.accepted) { result.status = 'REJECTED'; return result; }
        result.stage = 'evaluation';
        const rows = [];
        for (const [i, record] of records.entries()) {
            let value, error;
            const runId = 'q-' + result.qualificationId + '-' + i;
            try {
                // Execute the candidate in isolation BEFORE publication.
                const run = await runFlow({ spec, input: { id: record.id, texto: record.texto },
                    stateDirectory: join(output, 'candidate-state'), runId, identity: functional.identity });
                value = run.output;
                insist(value.id === record.id && LABELS.includes(value.categoria)
                    && value.requiere_revision === (value.categoria === 'revisión'), 'Candidate output violates evaluation contract');
            } catch (failure) { error = String(failure.message).slice(0, 2048); }
            rows.push({ id: record.id, runId, textHash: sha(record.texto), expected: record.categoria_esperada,
                predicted: error ? 'error' : value.categoria, rules: error ? [] : value.reglas_aplicadas, error: error ?? null });
        }
        const evaluation = { schemaVersion: 1, specHash: sha(spec), datasetHash: sha(datasetText), criteriaHash: sha(criteria),
            results: rows, metrics: summarize(rows, criteria) };
        await createFile(output, 'evaluation.json', evaluation);
        if (!evaluation.metrics.accepted) { result.status = 'REJECTED'; return result; }
        result.stage = 'publication';
        const publication = await publish({ spec, policy, registryDirectory });
        result.artifactId = publication.artifactId;
        result.status = 'ACCEPTED'; result.stage = 'complete';
        return result;
    } catch (error) {
        result.status = 'ERROR'; result.error = String(error.message).slice(0, 2048);
        throw error;
    } finally {
        await createFile(output, 'result.json', result);
        if (result.status === 'ACCEPTED') {
            const files = {};
            for (const name of FILES) files[name] = sha(await readFile(join(output, name)));
            const content = { schemaVersion: 1, artifactId: result.artifactId, qualifierIdentity: identity, files };
            await createFile(output, 'release.json', { ...content, releaseId: sha(content) });
        }
    }
}
export async function loadQualifiedRelease({ directory, registryDirectory, allowExperimental = false }) {
    const root = await safeDirectory(directory);
    const read = async name => {
        insist(!(await lstat(join(root, name))).isSymbolicLink(), 'Release file symlink rejected');
        return readFile(join(root, name));
    };
    const manifest = JSON.parse(await read('release.json'));
    const { releaseId, ...content } = manifest;
    insist(manifest.schemaVersion === 1 && sha(content) === releaseId, 'Release fingerprint mismatch');
    insist(canonical(Object.keys(manifest.files).sort()) === canonical([...FILES].sort()), 'Unknown release files');
    insist(canonical(manifest.qualifierIdentity) === canonical(await qualifierIdentity()), 'Qualifier changed; repeat qualification');
    const data = {};
    for (const name of FILES) {
        const bytes = await read(name); insist(sha(bytes) === manifest.files[name], 'Qualified evidence tampered: ' + name);
        data[name] = name.endsWith('.jsonl') ? bytes.toString() : JSON.parse(bytes);
    }
    const result = data['result.json'], functional = data['functional.json'], evaluation = data['evaluation.json'];
    insist(result.status === 'ACCEPTED' && result.stage === 'complete' && result.artifactId === manifest.artifactId,
        'Candidate did not pass both gates');
    insist(['real', 'ilustrativo'].includes(result.kind), 'Invalid release kind');
    insist(result.releaseLevel === (result.kind === 'ilustrativo' ? 'experimental' : 'evaluated-real-data'), 'Release level mismatch');
    insist(allowExperimental || result.kind === 'real', 'Experimental release requires explicit allowExperimental');
    const records = parseDataset(data['dataset.jsonl']);
    rejectFixtureOverlap(records, data['policy.json']);
    insist(functional.accepted && functional.specHash === sha(data['spec.json']) && functional.policyHash === sha(data['policy.json']), 'Functional verdict mismatch');
    insist(result.specHash === functional.specHash && result.policyHash === functional.policyHash
        && result.datasetHash === sha(data['dataset.jsonl']) && result.criteriaHash === sha(data['criteria.json']), 'Release inputs mismatch');
    insist(evaluation.results.length === records.length && records.every((record, i) => {
        const row = evaluation.results[i];
        return row.id === record.id && row.expected === record.categoria_esperada && row.textHash === sha(record.texto);
    }), 'Evaluation records mismatch');
    const metrics = summarize(evaluation.results, data['criteria.json']);
    insist(metrics.accepted && canonical(metrics) === canonical(evaluation.metrics), 'Evaluation gate is not satisfied');
    insist(canonical(functional.identity) === canonical(await runtimeIdentity()), 'Runtime changed; repeat qualification');
    const artifact = await loadArtifact({ registryDirectory, artifactId: manifest.artifactId });
    insist(sha(artifact.spec) === functional.specHash && sha(artifact.policy) === functional.policyHash, 'Release does not match published artifact');
    return { releaseId, result, artifact, evaluation };
}
export async function executeQualified({ qualificationDirectory, registryDirectory, allowExperimental = false, input, stateDirectory, runId, resume = false }) {
    const release = await loadQualifiedRelease({ directory: qualificationDirectory, registryDirectory, allowExperimental });
    return executeArtifact({ registryDirectory, artifactId: release.result.artifactId, input, stateDirectory, runId, resume });
}

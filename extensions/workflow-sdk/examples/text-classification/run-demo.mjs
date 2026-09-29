import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { executeArtifact } from '../../src/index.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    if (!['--registry', '--artifact', '--state'].includes(key) || !process.argv[i + 1] || options[key]) throw new Error('Expected registry, artifact and state');
    options[key] = process.argv[i + 1];
}
assert(options['--registry'] && options['--artifact'] && options['--state']);
const samples = [
    { input: { id: 'demo-urgente', texto: 'URGENTE: estoy bloqueado y no puedo trabajar' },
        expected: { id: 'demo-urgente', texto_normalizado: 'urgente: estoy bloqueado y no puedo trabajar', categoria: 'urgente', requiere_revision: false, reglas_aplicadas: ['urgente.explicita', 'urgente.bloqueo'] } },
    { input: { id: 'demo-normal', texto: 'No es urgente, cuando puedas' },
        expected: { id: 'demo-normal', texto_normalizado: 'no es urgente, cuando puedas', categoria: 'normal', requiere_revision: false, reglas_aplicadas: ['normal.sin_urgencia', 'normal.sin_prisa'] } },
    { input: { id: 'demo-revision', texto: 'No sé si es urgente' },
        expected: { id: 'demo-revision', texto_normalizado: 'no sé si es urgente', categoria: 'revisión', requiere_revision: true, reglas_aplicadas: ['urgente.explicita', 'revision.incertidumbre'] } }
];
const results = [];
for (const sample of samples) {
    const parameters = { registryDirectory: options['--registry'], artifactId: options['--artifact'],
        stateDirectory: options['--state'], runId: 'demo-' + randomUUID(), input: sample.input };
    const execution = await executeArtifact(parameters);
    assert.deepEqual(execution.output, sample.expected);
    assert.equal(execution.invocations.length, 2);
    const resumed = await executeArtifact({ ...parameters, resume: true });
    assert.deepEqual(resumed.output, sample.expected);
    assert.equal(resumed.invocations.length, 0);
    assert.equal(resumed.snapshotHash, execution.snapshotHash);
    results.push({ input: sample.input, execution, resumed });
}
console.log(JSON.stringify({ accepted: true, results }, null, 2));

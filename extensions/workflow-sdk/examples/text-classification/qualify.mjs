import { readFile } from 'node:fs/promises';
import { qualifyClassifier } from './qualification.mjs';
const allowed = ['--spec', '--policy', '--dataset', '--criteria', '--kind', '--output', '--registry'];
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    if (!allowed.includes(key) || !process.argv[i + 1] || options[key]) throw new Error('Invalid qualification argument');
    options[key] = process.argv[i + 1];
}
try {
    if (!allowed.every(key => options[key])) throw new Error('Required: spec, policy, dataset, criteria, kind, output, registry');
    const json = async path => { const bytes = await readFile(path); if (bytes.length > 1048576) throw new Error('JSON exceeds 1 MiB'); return JSON.parse(bytes); };
    const result = await qualifyClassifier({ spec: await json(options['--spec']), policy: await json(options['--policy']),
        datasetText: await readFile(options['--dataset'], 'utf8'), criteria: await json(options['--criteria']), kind: options['--kind'],
        outputDirectory: options['--output'], registryDirectory: options['--registry'] });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'ACCEPTED' ? 0 : 2;
} catch (error) { console.error('ERROR: ' + error.message); process.exitCode = 1; }

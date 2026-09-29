import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localOllama, generateAndQualify } from './generation.mjs';
import { qualifyClassifier } from './qualification.mjs';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    if (!['--model', '--url', '--output', '--registry', '--attempts'].includes(key) || !process.argv[i + 1] || options[key]) throw new Error('Invalid CLI option');
    options[key] = process.argv[i + 1];
}
if (!options['--model'] || !options['--output'] || !options['--registry']) throw new Error('Required: --model --output --registry');
const json = async name => JSON.parse(await readFile(new URL(name, import.meta.url)));
const registryDirectory = resolve(options['--registry']);
const result = await generateAndQualify({ template: await json('flow.json'), policy: await json('policy.json'),
    criteria: await json('evaluation-criteria.json'), datasetText: await readFile(new URL('dataset-ilustrativo.jsonl', import.meta.url), 'utf8'),
    kind: 'ilustrativo', provider: await localOllama({ model: options['--model'], baseURL: options['--url'] }),
    qualify: args => qualifyClassifier({ ...args, registryDirectory }), outputDirectory: resolve(options['--output']),
    maxAttempts: Number(options['--attempts'] ?? 3) });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'ACCEPTED' ? 0 : 2;

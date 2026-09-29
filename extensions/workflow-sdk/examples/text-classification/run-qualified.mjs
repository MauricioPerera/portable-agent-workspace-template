import { readFile } from 'node:fs/promises';
import { executeQualified } from './qualification.mjs';
const required = ['--qualification', '--registry', '--input', '--state', '--run-id'];
const options = {};
try {
    for (let i = 2; i < process.argv.length; i += 2) {
        const key = process.argv[i];
        if (![...required, '--allow-experimental', '--resume'].includes(key) || !process.argv[i + 1] || options[key]) throw new Error('Invalid qualified-run argument');
        options[key] = process.argv[i + 1];
    }
    if (!required.every(key => options[key])) throw new Error('Required: qualification, registry, input, state, run-id');
    for (const key of ['--allow-experimental', '--resume']) if (options[key] !== undefined && !['true', 'false'].includes(options[key])) throw new Error(key + ' requires true or false');
    const result = await executeQualified({ qualificationDirectory: options['--qualification'], registryDirectory: options['--registry'],
        input: JSON.parse(await readFile(options['--input'], 'utf8')), stateDirectory: options['--state'], runId: options['--run-id'],
        resume: options['--resume'] === 'true', allowExperimental: options['--allow-experimental'] === 'true' });
    console.log(JSON.stringify(result));
} catch (error) { console.error('ERROR: ' + error.message); process.exitCode = 1; }

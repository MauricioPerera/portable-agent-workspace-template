import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
async function cli(...args) {
    try {
        const result = await exec(process.execPath, ['src/cli.mjs', ...args], { cwd: root, maxBuffer: 2 * 1024 * 1024 });
        return { code: 0, data: JSON.parse(result.stdout), stderr: result.stderr };
    } catch (error) {
        return { code: error.code, data: error.stdout.trim() ? JSON.parse(error.stdout) : undefined,
            error: error.stderr.trim() ? JSON.parse(error.stderr) : undefined };
    }
}
test('Discovery exposes the same argument contract enforced by the CLI', async () => {
    const catalog = await cli('search');
    assert.equal(catalog.code, 0);
    assert.equal(catalog.data.operations.length, 7);
    for (const name of ['search', 'schema', 'validate', 'compile', 'verify', 'publish', 'run']) {
        const contract = await cli('schema', name);
        assert.equal(contract.data.name, name);
        assert.equal(contract.data.arguments.additionalProperties, false);
        assert.equal((await cli(name, '--invented', 'yes')).error.error.code, 'CLI_INVALID_ARGUMENT');
    }
    for (const [query, expected] of [['ejecutar', 'run'], ['qualidade', 'verify'], ['validate', 'validate']]) {
        assert.equal((await cli('search', query)).data.operations[0].name, expected);
    }
    assert.deepEqual((await cli('search', 'nothing-matches-this-term')).data.operations, []);
    assert.equal((await cli('schema', 'delete')).error.error.code, 'CLI_UNKNOWN_OPERATION');
});
test('Static validation distinguishes contracts from functional quality and rejects invalid inputs', async () => {
    const good = await cli('validate', '--spec', 'examples/flow.json', '--policy', 'examples/policy.json', '--input', 'examples/input.json');
    assert.equal(good.code, 0); assert.equal(good.data.valid, true); assert.equal(good.data.qualityVerified, false);
    for (const args of [[], ['--spec'], ['--spec', 'examples/flow.json', '--spec', 'examples/flow.json']]) {
        assert.equal((await cli('validate', ...args)).code, 1);
    }
    assert.equal((await cli('verify', '--spec', 'examples/flow.json', '--dry-run')).code, 1);
    const directory = await mkdtemp(join(tmpdir(), 'cli-validation-'));
    try {
        const input = join(directory, 'input.json'); await writeFile(input, '{"texto":42}');
        const bad = await cli('validate', '--spec', 'examples/flow.json', '--input', input);
        assert.equal(bad.code, 1); assert.equal(bad.error.error.code, 'SCHEMA_INVALID');
        assert.ok(bad.error.error.issues.length);
        const policy = JSON.parse(await readFile(join(root, 'examples/policy.json')));
        policy.maxLimits.memoryMb = 64;
        const path = join(directory, 'policy.json'); await writeFile(path, JSON.stringify(policy));
        assert.equal((await cli('publish', '--spec', 'examples/flow.json', '--policy', path, '--registry', join(directory, 'registry'), '--dry-run')).code, 1);
        await assert.rejects(access(join(directory, 'registry')));
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Dry-run never executes candidate source or writes its declared destinations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cli-plan-'));
    try {
        const spec = JSON.parse(await readFile(join(root, 'examples/flow.json')));
        spec.tasks[0].source = 'throw new Error("CANDIDATE_EXECUTED");';
        const path = join(directory, 'flow.json'); await writeFile(path, JSON.stringify(spec));
        const before = await readdir(directory);
        for (const operation of ['validate', 'compile', 'verify', 'publish']) {
            const args = ['--spec', path, '--dry-run'];
            if (['verify', 'publish'].includes(operation)) args.push('--policy', 'examples/policy.json', '--evidence', join(directory, 'evidence'));
            if (operation === 'publish') args.push('--registry', join(directory, 'registry'));
            const plan = await cli(operation, ...args);
            assert.equal(plan.code, 0, JSON.stringify(plan));
            assert.equal(plan.data.executed, false); assert.equal(plan.data.qualityVerified, false);
            assert.deepEqual(plan.data.steps.map(item => item.id), ['limpiar', 'medir']);
            assert.deepEqual(plan.data.steps[0].permissions, { network: false, filesystem: false });
        }
        assert.deepEqual(await readdir(directory), before);
        assert.equal((await cli('validate', '--spec', path)).code, 0);
        assert.equal((await cli('compile', '--spec', path)).code, 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Linux CLI verifies, publishes, plans, executes, resumes and rejects tampering', { skip: process.platform !== 'linux' }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cli-operational-'));
    const registry = join(directory, 'registry'), state = join(directory, 'state');
    try {
        const published = await cli('publish', '--spec', 'examples/flow.json', '--policy', 'examples/policy.json', '--registry', registry);
        assert.equal(published.code, 0, JSON.stringify(published)); assert.equal(published.data.accepted, true);
        const args = ['--registry', registry, '--artifact', published.data.artifactId, '--input', 'examples/input.json', '--state', state, '--run-id', 'cli-run'];
        const plan = await cli('run', ...args, '--dry-run');
        assert.equal(plan.code, 0, JSON.stringify(plan)); assert.equal(plan.data.artifactVerified, true);
        await assert.rejects(access(state));
        const missing = join(directory, 'missing-registry');
        assert.equal((await cli('run', ...args.map(value => value === registry ? missing : value), '--dry-run')).code, 1);
        await assert.rejects(access(missing));
        const run = await cli('run', ...args);
        assert.equal(run.code, 0, JSON.stringify(run)); assert.equal(run.data.status, 'SUCCEEDED'); assert.equal(run.data.invocations.length, 2);
        const resumed = await cli('run', ...args, '--resume', 'true');
        assert.equal(resumed.code, 0, JSON.stringify(resumed)); assert.deepEqual(resumed.data.output, run.data.output); assert.equal(resumed.data.invocations.length, 0);
        await writeFile(join(registry, published.data.artifactId, 'spec.json'), '{}');
        assert.equal((await cli('run', ...args, '--dry-run')).code, 1);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

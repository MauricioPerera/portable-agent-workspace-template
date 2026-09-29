import { readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { defineFlow, defineTask, ref, validateFlow, canonical, sha } from './definition.mjs';
import { validateValue, inspectValue, exactKeys, insist } from './schema.mjs';
import { compareJSON, preview, errorDiagnostic } from './diagnostics.mjs';
import { runFlow, compileFlow, safeDirectory } from './runtime.mjs';
import { sandboxTask, sandboxIdentity } from './sandbox.mjs';
export { defineFlow, defineTask, ref, compileFlow, inspectValue, compareJSON };

export async function runtimeIdentity() {
    const files = {};
    for (const name of ['index.mjs', 'definition.mjs', 'schema.mjs', 'diagnostics.mjs', 'runtime.mjs', 'sandbox.mjs', 'worker.cjs', 'lock-holder.cjs'])
        files[name] = sha(await readFile(fileURLToPath(new URL(name, import.meta.url))));
    for (const name of ['package.json', 'package-lock.json']) files[name] = sha(await readFile(fileURLToPath(new URL('../' + name, import.meta.url))));
    files.nodeBinary = sha(await readFile(process.execPath));
    const require = createRequire(import.meta.url);
    files.engine = sha(await readFile(require.resolve('activepieces-engine-standalone')));
    return { sdk: '0.1.0', files, sandbox: await sandboxIdentity() };
}
export function validatePolicy(spec, policy) {
    exactKeys(policy, ['schemaVersion', 'flowId', 'objective', 'maxLimits', 'taskCases', 'flowCases', 'maxMedianMs'], 'acceptance policy');
    insist(policy.schemaVersion === 1 && policy.flowId === spec.id && policy.objective === spec.objective, 'External objective does not match');
    exactKeys(policy.maxLimits, ['timeoutMs', 'memoryMb', 'outputBytes'], 'policy limits');
    for (const key of ['timeoutMs', 'memoryMb', 'outputBytes']) insist(Number.isInteger(policy.maxLimits[key]) && policy.maxLimits[key] > 0, 'Invalid policy limit');
    insist(Number.isInteger(policy.maxMedianMs) && policy.maxMedianMs >= 100 && policy.maxMedianMs <= 60000, 'Invalid latency criterion');
    exactKeys(policy.taskCases, spec.tasks.map(task => task.id), 'task fixtures');
    const checkCases = (cases, inputSchema, outputSchema) => {
        insist(Array.isArray(cases) && cases.length >= 2 && cases.length <= 32, 'Require 2..32 external fixtures');
        let positives = 0;
        for (const item of cases) {
            exactKeys(item, ['id', 'input', 'expected', 'expectError', 'expectErrorCode'], 'fixture');
            insist(typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100, 'Fixture ID required');
            if (item.expectError === true) {
                insist(!Object.hasOwn(item, 'expected'), 'Negative fixture cannot have expected output');
                insist(item.expectErrorCode === undefined || typeof item.expectErrorCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(item.expectErrorCode),'Invalid expected error code');
            }
            else {
                insist(item.expectErrorCode === undefined,'Positive fixture cannot expect an error code');
                insist(item.expectError === undefined || item.expectError === false, 'Invalid expectError');
                insist(Object.hasOwn(item, 'expected'), 'External expected output required');
                validateValue(item.input, inputSchema, 'fixture input'); validateValue(item.expected, outputSchema, 'fixture expected'); positives++;
            }
        }
        insist(positives >= 2, 'Require at least two positive external fixtures');
        insist(new Set(cases.map(item => item.id)).size === cases.length, 'Duplicate fixture IDs');
    };
    for (const task of spec.tasks) {
        for (const key of ['timeoutMs', 'memoryMb', 'outputBytes']) insist(task.limits[key] <= policy.maxLimits[key], 'Task exceeds external resource budget');
        checkCases(policy.taskCases[task.id], task.input, task.output);
    }
    checkCases(policy.flowCases, spec.input, spec.outputSchema);
    insist(Buffer.byteLength(canonical(policy)) <= 1048576, 'Acceptance policy exceeds 1 MiB');
}
export async function verify({ spec, policy, evidenceDirectory }) {
    validateFlow(spec); validatePolicy(spec, policy);
    const identity = await runtimeIdentity();
    const working = await mkdtemp(join(tmpdir(), 'workflow-sdk-verify-'));
    const cases = [];
    try {
        const test = async (scope, fixture, action) => {
            const started = performance.now();
            let actual, error, failureDiagnostic;
            try { actual = await action(); } catch (failure) { error = String(failure.message).slice(0, 2048); failureDiagnostic = errorDiagnostic(failure); }
            const passed = fixture.expectError === true ? error !== undefined && (fixture.expectErrorCode === undefined || failureDiagnostic.code === fixture.expectErrorCode)
                : error === undefined && canonical(actual) === canonical(fixture.expected);
            const diagnostic = passed ? null : error !== undefined && fixture.expectErrorCode !== undefined && fixture.expectErrorCode !== failureDiagnostic.code
                ? {code:'ERROR_CODE_MISMATCH',issues:[{code:'ERROR_CODE_MISMATCH',path:'',expected:fixture.expectErrorCode,actual:failureDiagnostic.code,hint:'Reject the invalid input with the contract error; a process failure or timeout does not meet this fixture.'}],truncated:false}
                : error !== undefined ? failureDiagnostic : fixture.expectError === true
                ? {code:'EXPECTED_ERROR_NOT_THROWN',issues:[{code:'EXPECTED_ERROR_NOT_THROWN',path:'',expected:'error',actual:preview(actual),hint:'Reject the invalid input as required by the external fixture.'}],truncated:false}
                : {code:'OUTPUT_MISMATCH',...compareJSON(fixture.expected,actual)};
            cases.push({ scope, id: fixture.id, passed, elapsedMs: performance.now() - started,
                inputHash: sha(fixture.input), expectedHash: fixture.expectError ? null : sha(fixture.expected),
                actualHash: error === undefined ? sha(actual) : null, error: error ?? null,errorCode:failureDiagnostic?.code ?? null, diagnostic,
                observed: !passed && error === undefined ? preview(actual) : null });
        };
        for (const task of spec.tasks) for (const fixture of policy.taskCases[task.id]) {
            await test('task:' + task.id, fixture, async () => {
                validateValue(fixture.input, task.input, 'task input');
                const result = await sandboxTask(task, fixture.input);
                validateValue(result.output, task.output, 'task output'); return result.output;
            });
        }
        for (const fixture of policy.flowCases) await test('flow', fixture, async () => {
            const result = await runFlow({ spec, input: fixture.input, stateDirectory: working,
                runId: 'fixture-' + randomUUID(), identity }); return result.output;
        });
        const times = cases.filter(item => item.scope === 'flow' && !item.error).map(item => item.elapsedMs).sort((a, b) => a - b);
        const medianMs = times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.ceil((times.length - 1) / 2)]) / 2 : Infinity;
        const report = { schemaVersion: 1, createdAt: new Date().toISOString(), specHash: sha(spec), policyHash: sha(policy), identity,
            cases, criteria: { allCasesPassed: cases.every(item => item.passed), medianMs: Number.isFinite(medianMs) ? medianMs : null,
                maxMedianMs: policy.maxMedianMs, latencyPassed: medianMs <= policy.maxMedianMs },
            accepted: cases.every(item => item.passed) && medianMs <= policy.maxMedianMs };
        if (evidenceDirectory) {
            const target = await safeDirectory(evidenceDirectory);
            await writeFile(resolve(target, 'verification-' + randomUUID() + '.json'), canonical(report), { flag: 'wx', mode: 0o600 });
        }
        return report;
    } finally { await rm(working, { recursive: true, force: true }); }
}
export async function publish({ spec, policy, registryDirectory, evidenceDirectory }) {
    // Publication ALWAYS runs the external verifier; caller cannot provide a verdict.
    const report = await verify({ spec, policy, evidenceDirectory });
    insist(report.accepted, 'Quality gate rejected artifact: ' + canonical(report.criteria));
    const registry = await safeDirectory(registryDirectory);
    const content = { specHash: report.specHash, policyHash: report.policyHash, identityHash: sha(report.identity) };
    const artifactId = sha(content);
    const staging = await mkdtemp(join(registry, '.staging-'));
    try {
        const files = { 'spec.json': spec, 'policy.json': policy, 'verification.json': report };
        const hashes = {};
        for (const [name, value] of Object.entries(files)) { const text = canonical(value); await writeFile(join(staging, name), text, { mode: 0o600 }); hashes[name] = sha(text); }
        await writeFile(join(staging, 'manifest.json'), canonical({ schemaVersion: 1, artifactId, ...content, files: hashes }), { mode: 0o600 });
        try { await rename(staging, join(registry, artifactId)); }
        catch (error) {
            if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
            await loadArtifact({ registryDirectory: registry, artifactId });
        }
        return { artifactId, directory: join(registry, artifactId), report };
    } finally { await rm(staging, { recursive: true, force: true }); }
}
export async function loadArtifact({ registryDirectory, artifactId }) {
    insist(/^[a-f0-9]{64}$/.test(artifactId), 'Invalid artifact ID');
    const registry = await safeDirectory(registryDirectory, { create: false });
    const directory = await safeDirectory(join(registry, artifactId), { create: false });
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    insist(manifest.schemaVersion === 1 && manifest.artifactId === artifactId, 'Invalid artifact identity');
    const expectedFiles = ['spec.json', 'policy.json', 'verification.json'];
    insist(canonical(Object.keys(manifest.files).sort()) === canonical(expectedFiles.sort()), 'Unexpected artifact files');
    const values = {};
    for (const name of expectedFiles) {
        const text = await readFile(join(directory, name), 'utf8');
        insist(sha(text) === manifest.files[name], 'Artifact tampered: ' + name); values[name] = JSON.parse(text);
    }
    const spec = values['spec.json'], policy = values['policy.json'], report = values['verification.json'];
    validateFlow(spec); validatePolicy(spec, policy);
    insist(report.accepted === true && report.criteria.allCasesPassed === true && report.criteria.latencyPassed === true, 'Artifact is not accepted');
    insist(report.specHash === sha(spec) && report.policyHash === sha(policy), 'Verdict does not match artifact');
    const expectedCases = [...spec.tasks.flatMap(task => policy.taskCases[task.id].map(item => ({ scope: 'task:' + task.id, ...item }))),
        ...policy.flowCases.map(item => ({ scope: 'flow', ...item }))];
    insist(report.cases?.length === expectedCases.length && expectedCases.every((item, i) => {
        const actual = report.cases[i];
        return actual.scope === item.scope && actual.id === item.id && actual.passed === true
            && actual.inputHash === sha(item.input) && actual.expectedHash === (item.expectError ? null : sha(item.expected))
            && (item.expectError ? typeof actual.error === 'string' && (item.expectErrorCode === undefined || actual.errorCode === item.expectErrorCode)
                : actual.error === null && actual.actualHash === sha(item.expected));
    }), 'Acceptance evidence does not match external cases');
    const times = report.cases.filter(item => item.scope === 'flow' && !item.error).map(item => item.elapsedMs).sort((a, b) => a - b);
    insist(times.length >= 2 && times.every(time => Number.isFinite(time) && time >= 0), 'Invalid latency evidence');
    const medianMs = (times[Math.floor((times.length - 1) / 2)] + times[Math.ceil((times.length - 1) / 2)]) / 2;
    insist(report.criteria.medianMs === medianMs && report.criteria.maxMedianMs === policy.maxMedianMs && medianMs <= policy.maxMedianMs, 'Latency evidence does not meet external criterion');
    const content = { specHash: sha(spec), policyHash: sha(policy), identityHash: sha(report.identity) };
    insist(sha(content) === artifactId && canonical(content) === canonical({ specHash: manifest.specHash, policyHash: manifest.policyHash, identityHash: manifest.identityHash }), 'Artifact fingerprint mismatch');
    insist(canonical(report.identity) === canonical(await runtimeIdentity()), 'Runtime changed; reverify artifact');
    return { spec, policy, report, artifactId };
}
export async function executeArtifact({ registryDirectory, artifactId, input, stateDirectory, runId, resume = false, events }) {
    const artifact = await loadArtifact({ registryDirectory, artifactId });
    return runFlow({ spec: artifact.spec, input, stateDirectory, runId, resume,
        identity: { artifactId, runtime: artifact.report.identity }, events });
}

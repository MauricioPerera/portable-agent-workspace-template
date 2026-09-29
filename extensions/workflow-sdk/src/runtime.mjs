import engine from 'activepieces-engine-standalone';
import { mkdir, readFile, writeFile, lstat, open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { validateFlow, sha, canonical, resolveBinding } from './definition.mjs';
import { validateValue, insist, ID } from './schema.mjs';
import { sandboxTask, withLock } from './sandbox.mjs';

const PIECE = '@workspace/generated-tasks';
async function atomicJSON(path, value) {
    const temporary = path + '.' + randomUUID() + '.tmp';
    try {
        const stream = await open(temporary, 'wx', 0o600);
        try { await stream.writeFile(canonical(value)); await stream.sync(); }
        finally { await stream.close(); }
        await rename(temporary, path);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export function compileFlow(spec) {
    validateFlow(spec);
    let next;
    for (const step of [...spec.steps].reverse()) {
        const task = spec.tasks.find(task => task.id === step.task);
        next = { name: step.id, displayName: step.id, type: 'PIECE', valid: true,
            lastUpdatedDate: '2026-09-28T00:00:00Z', settings: {
                pieceName: PIECE, pieceVersion: '1.0.0', actionName: 'execute_task',
                input: { stepId: step.id, taskHash: sha(task), bindingHash: sha(step.with) }, propertySettings: {},
            }, ...(next ? { nextAction: next } : {}) };
    }
    return { id: spec.id + '-' + sha(spec).slice(0, 16), flowId: spec.id,
        trigger: { name: 'trigger', displayName: 'SDK input', type: 'EMPTY', valid: true,
            lastUpdatedDate: '2026-09-28T00:00:00Z', settings: {}, nextAction: next } };
}
export async function safeDirectory(directory, { create = true } = {}) {
    const target = resolve(directory);
    let path = target;
    while (true) {
        try { insist(!(await lstat(path)).isSymbolicLink(), 'Symlink directory rejected'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const parent = resolve(path, '..'); if (parent === path) break; path = parent;
    }
    if (create) await mkdir(target, { recursive: true });
    else insist((await lstat(target)).isDirectory(), 'Expected existing directory');
    return target;
}
export async function runFlow({ spec, input, stateDirectory, runId, resume = false, identity = {}, events = async () => {} }) {
    validateFlow(spec); validateValue(input, spec.input, 'flow input');
    insist(ID.test(runId), 'Invalid run ID');
    const state = await safeDirectory(stateDirectory);
    return withLock(resolve(state, '.lock'), async () => {
        const requestPath = resolve(state, runId + '.request.json');
        const request = { schemaVersion: 1, specHash: sha(spec), inputHash: sha(input), identityHash: sha(identity) };
        if (resume) {
            const existing = JSON.parse(await readFile(requestPath, 'utf8'));
            insist(canonical(existing) === canonical(request), 'Incompatible request, artifact, input or runtime');
        } else await writeFile(requestPath, canonical(request), { flag: 'wx', mode: 0o600 });
        const adapters = engine.createFileAdapters(resolve(state, 'engine'));
        const checkpointPath = resolve(state, runId + '.checkpoint.json');
        // One atomic envelope prevents the checkpoint and its integrity hash diverging.
        adapters.state = {
            async load(id) {
                insist(id === runId, 'Wrong checkpoint identity');
                let envelope;
                try { envelope = JSON.parse(await readFile(checkpointPath, 'utf8')); }
                catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
                insist(envelope.schemaVersion === 1 && envelope.runId === runId && envelope.requestHash === sha(request)
                    && envelope.snapshotHash === sha(envelope.snapshot), 'Checkpoint integrity mismatch');
                return envelope.snapshot;
            },
            async save(id, snapshot) {
                insist(id === runId, 'Wrong checkpoint identity');
                await atomicJSON(checkpointPath, { schemaVersion: 1, runId, requestHash: sha(request), snapshotHash: sha(snapshot), snapshot });
            },
        };
        const saved = resume ? await adapters.state.load(runId) : undefined;
        const outputs = { input };
        if (saved) for (const step of spec.steps) {
            if (saved.steps[step.id]?.status === 'SUCCEEDED') {
                const task = spec.tasks.find(task => task.id === step.task);
                validateValue(saved.steps[step.id].output, task.output, 'restored task output');
                outputs[step.id] = saved.steps[step.id].output;
            }
        }
        const invocations = [];
        const action = engine.createAction({ name: 'execute_task', displayName: 'SDK task', description: '', requireAuth: false,
            props: Object.fromEntries(['stepId', 'taskHash', 'bindingHash'].map(key => [key, engine.Property.ShortText({ displayName: key, required: true })])),
            async run({ propsValue }) {
                const step = spec.steps.find(step => step.id === propsValue.stepId);
                insist(step, 'Unknown compiled step');
                const task = spec.tasks.find(task => task.id === step.task);
                insist(propsValue.taskHash === sha(task) && propsValue.bindingHash === sha(step.with), 'Compiled task changed');
                const taskInput = resolveBinding(step.with, outputs);
                validateValue(taskInput, task.input, task.id + ' input');
                const result = await sandboxTask(task, taskInput);
                validateValue(result.output, task.output, task.id + ' output');
                outputs[step.id] = result.output;
                invocations.push({ stepId: step.id, taskHash: sha(task), ...result });
                return result.output;
            },
        });
        const runtime = engine.createRuntime({ ...adapters, projectId: 'workflow-sdk', events,
            pieces: [{ name: PIECE, version: '1.0.0', piece: engine.createPiece({ displayName: 'Generated tasks', logoUrl: '', actions: [action], triggers: [] }) }] });
        const result = await runtime.execute({ flow: compileFlow(spec), payload: input, runId, resume });
        insist(result.verdict.status === 'SUCCEEDED', 'Workflow failed: ' + canonical(result.steps));
        for (const step of spec.steps) outputs[step.id] = result.steps[step.id].output;
        const output = resolveBinding(spec.output, outputs);
        validateValue(output, spec.outputSchema, 'flow output');
        return { runId, status: result.verdict.status, output, invocations, snapshotHash: sha(result) };
    });
}

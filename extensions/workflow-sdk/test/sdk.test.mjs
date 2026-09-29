import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { defineFlow, compileFlow, verify, publish, loadArtifact, executeArtifact } from '../src/index.mjs';
import { validateValue, checkSchema } from '../src/schema.mjs';
import { sandboxTask } from '../src/sandbox.mjs';
import { runFlow } from '../src/runtime.mjs';
const spec = JSON.parse(await readFile(new URL('../examples/flow.json', import.meta.url)));
const policy = JSON.parse(await readFile(new URL('../examples/policy.json', import.meta.url)));
const copy = value => structuredClone(value);
const linux = { skip: process.platform !== 'linux' };

test('SDK compiles own tasks into a stable engine chain', () => {
    const result = compileFlow(spec);
    assert.equal(result.trigger.nextAction.name, 'limpiar');
    assert.equal(result.trigger.nextAction.nextAction.name, 'medir');
    assert.deepEqual(result, compileFlow(copy(spec)));
    const altered = copy(spec); altered.tasks[0].source += '\n// changed';
    assert.notEqual(compileFlow(altered).id, result.id);
});
test('Rejects forward references and incompatible types', () => {
    const altered = copy(spec); altered.steps[0].with.texto = { $ref: 'medir.palabras' };
    assert.throws(() => defineFlow(altered), /Forward or unknown/);
    altered.steps[0].with.texto = { $ref: 'input.texto' };
    altered.steps[1].with.texto = { $ref: 'limpiar' };
    assert.throws(() => defineFlow(altered), /type mismatch/);
});
test('Rejects unknown schema keywords, invalid values and permissions', () => {
    assert.throws(() => checkSchema({ type: 'string', pattern: '.*' }), /unsupported field/);
    assert.throws(() => validateValue({ texto: 4 }, spec.input), /expected string/);
    assert.throws(() => validateValue({ texto: 'ok', extra: 1 }, spec.input), /unexpected property/);
    const altered = copy(spec); altered.tasks[0].permissions.network = true;
    assert.throws(() => defineFlow(altered), /without network/);
    altered.tasks[0].permissions.network = false; altered.tasks[0].limits.timeoutMs = 60000;
    assert.throws(() => defineFlow(altered), /Invalid limit/);
});
test('Rejects duplicates, missing inputs and unsupported topology', () => {
    const altered = copy(spec); altered.steps[1].id = 'limpiar';
    assert.throws(() => defineFlow(altered), /Duplicate/);
    altered.steps[1].id = 'medir'; altered.steps[0].with = {};
    assert.throws(() => defineFlow(altered), /Missing binding/);
    altered.steps[0].with = { texto: { $ref: 'input.texto' } }; altered.steps[0].branches = [];
    assert.throws(() => defineFlow(altered), /unsupported field/);
});
test('External criteria required; cannot raise budgets or skip task fixtures', async () => {
    const altered = copy(policy); altered.taskCases.normalizar = [];
    await assert.rejects(verify({ spec, policy: altered }), /external fixtures/);
    altered.taskCases.normalizar = copy(policy.taskCases.normalizar); altered.maxLimits.memoryMb = 64;
    await assert.rejects(verify({ spec, policy: altered }), /resource budget/);
    altered.maxLimits.memoryMb = 128; altered.objective = 'Different goal';
    await assert.rejects(verify({ spec, policy: altered }), /External objective/);
});
test('Sandbox denies host files, credentials, subprocesses and network', linux, async () => {
    const task = copy(spec.tasks[0]);
    task.output = { type: 'object', properties: { texto: { type: 'string', maxLength: 4096 } }, required: ['texto'], additionalProperties: false };
    process.env.WORKFLOW_SDK_SECRET_PROBE = 'must-not-leak';
    try {
        task.source = 'module.exports=()=>({texto:String(process.env.WORKFLOW_SDK_SECRET_PROBE)});';
        assert.equal((await sandboxTask(task, {})).output.texto, 'undefined');
        task.source = 'module.exports=()=>({texto:require("node:fs").readFileSync("/etc/passwd","utf8")});';
        await assert.rejects(sandboxTask(task, {}), /failed/);
        task.source = 'module.exports=()=>require("node:child_process").execFileSync("/usr/bin/node",["-e","console.log(1)"]);';
        await assert.rejects(sandboxTask(task, {}), /failed/);
        task.source = 'module.exports=async()=>({texto:await (await fetch("http://1.1.1.1")).text()});';
        await assert.rejects(sandboxTask(task, {}), /failed/);
    } finally { delete process.env.WORKFLOW_SDK_SECRET_PROBE; }
});
test('Sandbox enforces timeout, output limit and memory limit', linux, async () => {
    const task = copy(spec.tasks[0]);
    task.limits.timeoutMs = 1500;
    task.source = 'module.exports=()=>{while(true){}};';
    await assert.rejects(sandboxTask(task, {}), /timeout/);
    task.source = 'module.exports=()=>{process.stdout.write("x".repeat(100000));return {texto:"ok"};};';
    task.limits.outputBytes = 1024;
    await assert.rejects(sandboxTask(task, {}), /output_limit/);
    task.limits.outputBytes = 16384; task.limits.timeoutMs = 5000; task.limits.memoryMb = 64;
    task.source = 'module.exports=()=>{const a=[];for(let i=0;i<1000;i++)a.push(Buffer.alloc(1024*1024,1));return {texto:String(a.length)}};';
    await assert.rejects(sandboxTask(task, {}), /failed/);
});
test('Verifier accepts correct tasks and rejects wrong results and contracts', linux, async () => {
    const report = await verify({ spec, policy });
    assert.equal(report.accepted, true, JSON.stringify(report));
    assert.equal(report.cases.length, 9);
    const wrong = copy(spec); wrong.tasks[1].source = 'module.exports=()=>({palabras:999});';
    assert.equal((await verify({ spec: wrong, policy })).accepted, false);
    wrong.tasks[1].source = 'module.exports=()=>({palabras:"two"});';
    assert.equal((await verify({ spec: wrong, policy })).accepted, false);
});
test('Publication, execution, completed resume and tamper detection', linux, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-publication-test-'));
    try {
        const result = await publish({ spec, policy, registryDirectory: join(directory, 'registry') });
        const parameters = { registryDirectory: join(directory, 'registry'), artifactId: result.artifactId,
            input: { texto: '  Hola MUNDO  ' }, stateDirectory: join(directory, 'state'), runId: 'published-run' };
        const run = await executeArtifact(parameters);
        assert.deepEqual(run.output, { texto: 'hola mundo', palabras: 2 });
        assert.equal(run.invocations.length, 2);
        const resumed = await executeArtifact({ ...parameters, resume: true });
        assert.deepEqual(resumed.output, run.output); assert.equal(resumed.invocations.length, 0);
        await assert.rejects(executeArtifact({ ...parameters, resume: true, input: { texto: 'Changed' } }), /Incompatible/);
        const checkpoint = join(directory, 'state/published-run.checkpoint.json');
        const modified = JSON.parse(await readFile(checkpoint));
        modified.snapshot.steps.limpiar.output.texto = 'tampered';
        await writeFile(checkpoint, JSON.stringify(modified));
        await assert.rejects(executeArtifact({ ...parameters, resume: true }), /Checkpoint integrity/);
        const path = join(result.directory, 'spec.json');
        await writeFile(path, (await readFile(path, 'utf8')) + ' ');
        await assert.rejects(loadArtifact(parameters), /tampered/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Rejected code cannot be published', linux, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-rejection-test-'));
    try {
        const wrong = copy(spec); wrong.tasks[1].source = 'module.exports=()=>({palabras:999});';
        await assert.rejects(publish({ spec: wrong, policy, registryDirectory: join(directory, 'registry') }), /Quality gate/);
        await assert.rejects(readFile(join(directory, 'registry')), /ENOENT/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Process crash resumes from completed task without repeating it; state lock blocks overlap', linux, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-recovery-test-'));
    const marker = join(directory, 'held.json');
    const modulePath = new URL('../src/runtime.mjs', import.meta.url).href;
    const code = `import {runFlow} from ${JSON.stringify(modulePath)};import{writeFileSync}from'node:fs';
        await runFlow({spec:${JSON.stringify(spec)},input:{texto:'  Hola MUNDO  '},stateDirectory:${JSON.stringify(directory)},runId:'recovery',events:async event=>{
        if(event.completedSteps.includes('limpiar')&&!event.completedSteps.includes('medir')){writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid}));await new Promise(resolve=>setTimeout(resolve,30000));}}});`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = ''; child.stderr.on('data', data => { errors += data; });
    try {
        const until = Date.now() + 12000;
        while (Date.now() < until) { try { await readFile(marker); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); } }
        assert.equal(JSON.parse(await readFile(marker)).pid, child.pid, errors);
        await assert.rejects(runFlow({ spec, input: { texto: 'hello' }, stateDirectory: directory, runId: 'overlap' }), /state lock/);
        const checkpoint = join(directory, 'recovery.checkpoint.json');
        const before = JSON.parse(await readFile(checkpoint)).snapshot.steps.limpiar;
        const exited = new Promise(resolve => child.on('close', resolve)); child.kill('SIGKILL'); await exited;
        const result = await runFlow({ spec, input: { texto: '  Hola MUNDO  ' }, stateDirectory: directory, runId: 'recovery', resume: true });
        assert.deepEqual(result.output, { texto: 'hola mundo', palabras: 2 });
        assert.deepEqual(result.invocations.map(item => item.stepId), ['medir']);
        assert.deepEqual(JSON.parse(await readFile(checkpoint)).snapshot.steps.limpiar, before);
    } finally { child.kill('SIGKILL'); await rm(directory, { recursive: true, force: true }); }
});

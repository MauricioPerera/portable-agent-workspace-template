import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { sha } from '../src/definition.mjs';
import { applySources, generateAndQualify, localOllama } from '../examples/text-classification/generation.mjs';
import { createServer } from 'node:http';
const example = new URL('../examples/text-classification/', import.meta.url);
const template = JSON.parse(await readFile(new URL('flow.json', example)));
const policy = JSON.parse(await readFile(new URL('policy.json', example)));
const criteria = JSON.parse(await readFile(new URL('evaluation-criteria.json', example)));
const content = JSON.stringify({ sources: template.tasks.map(({ id, source }) => ({ id, source })) });
test('generated response can replace sources only', () => {
    assert.deepEqual(applySources(template, content), template);
    assert.throws(() => applySources(template, JSON.stringify({sources: [], policy:{}})));
    assert.throws(() => applySources(template, JSON.stringify({sources:[{id:template.tasks[0].id,source:'x'},{id:template.tasks[0].id,source:'x'}]})));
    assert.throws(() => applySources(template, 'x'.repeat(131073)));
});
test('provider rejects nonlocal URLs before any request', async () => {
    await assert.rejects(localOllama({baseURL:'https://example.com', model:'x'}), /loopback/);
});
test('provider refuses a cloud alias served by a loopback API', async () => {
    let requests = 0;
    const server = createServer((request, response) => {
        requests++; response.setHeader('Content-Type','application/json');
        response.end(JSON.stringify({models:[{name:'claimed-local',digest:'x',remote_host:'https://ollama.com'}]}));
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    try {
        await assert.rejects(localOllama({baseURL:'http://127.0.0.1:'+server.address().port,model:'claimed-local'}),/local model/);
        assert.equal(requests,1);
    } finally {await new Promise(resolve => server.close(resolve));}
});
test('generic GGUF prompt template is rejected before generation', async () => {
    let requests = 0;
    const server = createServer((request,response) => {
        requests++; response.setHeader('Content-Type','application/json');
        response.end(JSON.stringify(request.url === '/api/tags' ? {models:[{name:'local-tag',digest:'x'}]} : {template:'{{ .Prompt }}'}));
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    try {
        await assert.rejects(localOllama({baseURL:'http://127.0.0.1:'+server.address().port,model:'local-tag'}),/Generic imported template/);
        assert.equal(requests,2);
    } finally {await new Promise(resolve => server.close(resolve));}
});
test('bounded repair uses development failures and immutable criteria', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'generation-'));
    let calls = 0, qualifications = 0;
    try {
        const result = await generateAndQualify({ template, policy, criteria, kind:'ilustrativo', datasetText:'secret heldout text',
            outputDirectory:join(temporary,'run'), provider:{identity:{fixture:true}, async generate(messages) {
                calls++; assert(!JSON.stringify(messages).includes('secret heldout text'));
                return {content: calls === 1 ? '{}' : content};
            }}, qualify: async args => {
                qualifications++; assert.deepEqual(args.criteria, criteria);
                return {status:'ACCEPTED',stage:'complete'};
            }});
        assert.equal(result.status,'ACCEPTED'); assert.equal(calls,2); assert.equal(qualifications,1);
    } finally { await rm(temporary,{recursive:true,force:true}); }
});
test('evaluation rejection ends repair without exposing heldout result', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'generation-'));
    let calls = 0;
    try {
        const result = await generateAndQualify({template, policy, criteria, kind:'ilustrativo', datasetText:'private',
            outputDirectory:join(temporary,'run'), provider:{identity:{fixture:true},async generate() {calls++;return {content};}},
            qualify:async () => ({status:'REJECTED',stage:'evaluation'})});
        assert.equal(calls,1); assert.equal(result.status,'REJECTED');
    } finally {await rm(temporary,{recursive:true,force:true});}
});
test('functional feedback repairs and exhausted attempts never qualify invalid JSON', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'generation-'));
    let calls = 0;
    try {
        const result = await generateAndQualify({template,policy,criteria,kind:'ilustrativo',datasetText:'private',
            outputDirectory:join(temporary,'repair'), provider:{identity:{fixture:true},async generate(messages) {
                calls++; if(calls===2) assert(JSON.stringify(messages).includes('failed-case'));
                return {content:calls===1 ? JSON.stringify({sources:template.tasks.map(({id,source})=>({id,source:source+'\n// first candidate'}))}) : content};
            }}, qualify:async args => {
                if(calls===2) return {status:'ACCEPTED',stage:'complete'};
                await mkdir(args.outputDirectory);
                await writeFile(join(args.outputDirectory,'functional.json'),JSON.stringify({criteria:{allCasesPassed:false},cases:[{passed:false,scope:'flow',id:'failed-case',error:null}]}));
                return {status:'REJECTED',stage:'functional'};
            }});
        assert.equal(result.status,'ACCEPTED'); assert.equal(calls,2);
        const exhausted = await generateAndQualify({template,policy,criteria,kind:'ilustrativo',datasetText:'private',maxAttempts:2,
            outputDirectory:join(temporary,'exhausted'),provider:{identity:{fixture:true},async generate(){return {content:'{}'};}},
            qualify:async()=>{throw new Error('Must not run invalid definition');}});
        assert.equal(exhausted.status,'EXHAUSTED'); assert.equal(exhausted.attempts.length,2);
    } finally {await rm(temporary,{recursive:true,force:true});}
});
test('repair loop qualifies actual sandboxed candidates on Linux', {skip:process.platform !== 'linux'}, async () => {
    const {qualifyClassifier} = await import('../examples/text-classification/qualification.mjs');
    const temporary = await mkdtemp(join(tmpdir(),'generation-integrated-'));
    let calls = 0;
    const wrong = JSON.parse(content);
    wrong.sources.find(task => task.id === 'clasificar').source = 'module.exports = () => ({categoria:"normal",requiere_revision:false,reglas_aplicadas:[]});';
    try {
        const result = await generateAndQualify({template,policy,criteria,kind:'ilustrativo',
            datasetText:await readFile(new URL('dataset-ilustrativo.jsonl',example),'utf8'),outputDirectory:join(temporary,'run'),
            provider:{identity:{fixture:true},async generate(messages,responseContract) {
                calls++;
                if(calls===2) {
                    const feedback = JSON.parse(messages.at(-1).content).repair;
                    const diagnostic = feedback.failures.find(item => item.scope === 'task:clasificar' && item.id === 'urgente-explicita');
                    assert.equal(diagnostic.actual.categoria,'normal');
                    assert.equal(diagnostic.expected.categoria,'urgente');
                    assert.deepEqual(responseContract.taskIds,['clasificar']);
                    const original=JSON.parse(await readFile(join(temporary,'run','qualification-1','functional.json')));
                    assert.equal(sha(diagnostic.actual),original.cases.find(item=>item.id==='urgente-explicita').actualHash);
                    assert(feedback.groups.some(group=>group.path==='/categoria' && group.taskId==='clasificar'));
                }
                return {content:calls===1 ? JSON.stringify(wrong) : JSON.stringify({sources:template.tasks.filter(task=>responseContract.taskIds.includes(task.id)).map(({id,source})=>({id,source}))})};
            }},qualify:args => qualifyClassifier({...args,registryDirectory:join(temporary,'registry')})});
        assert.equal(result.status,'ACCEPTED'); assert.equal(calls,2);
        assert.equal(result.attempts[0].qualification.status,'REJECTED');
        assert.equal(result.attempts[0].qualification.artifactId,null);
        assert.equal(result.attempts[1].qualification.releaseLevel,'experimental');
        assert(!(await readdir(join(temporary,'run'))).some(name=>name.startsWith('diagnostic-')));
    } finally {await rm(temporary,{recursive:true,force:true});}
});

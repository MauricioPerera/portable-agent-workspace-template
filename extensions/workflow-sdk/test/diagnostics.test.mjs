import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJSON, preview } from '../src/diagnostics.mjs';
import { inspectValue, validateValue, compatible } from '../src/schema.mjs';
import { applySources } from '../examples/text-classification/generation.mjs';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAndQualify } from '../examples/text-classification/generation.mjs';
import { buildRepairFeedback } from '../examples/text-classification/repair-feedback.mjs';
import { verify } from '../src/index.mjs';
const root=new URL('../examples/text-classification/',import.meta.url);
const spec=JSON.parse(await readFile(new URL('flow.json',root)));
const policy=JSON.parse(await readFile(new URL('policy.json',root)));
const criteria=JSON.parse(await readFile(new URL('evaluation-criteria.json',root)));
test('field differences distinguish values, missing items, order and Unicode',()=>{
    assert.deepEqual(compareJSON({b:2,a:1},{a:1,b:2}).issues,[]);
    const result=compareJSON({categoria:'urgente',reglas:[],texto:'é','a/b':null},{categoria:'normal',reglas:['normal.sin_urgencia'],texto:'e\u0301'});
    assert(result.issues.some(item=>item.code==='MISSING_FIELD' && item.path==='/a~1b'));
    assert(result.issues.some(item=>item.path==='/reglas/0' && item.code==='UNEXPECTED_FIELD'));
    assert.deepEqual(result.issues.find(item=>item.path==='/texto').firstDifference,{utf16Offset:0,expectedCodePoint:233,actualCodePoint:101});
    assert.equal(compareJSON(['a','b'],['b','a']).issues[0].code,'ARRAY_ORDER');
    assert.equal(compareJSON(null,{}).issues[0].code,'TYPE_MISMATCH');
});
test('schema reports multiple failures with stable JSON Pointer paths',()=>{
    const schema={type:'object',additionalProperties:false,required:['x','z'],properties:{x:{type:'string',enum:['abc'],minLength:3},
        z:{type:'string'},y:{type:'array',maxItems:2,items:{type:'integer',maximum:10}}}};
    const result=inspectValue({y:[99,'wrong',4],x:'b',extra:true},schema);
    assert.equal(result.valid,false);
    assert.deepEqual(result.issues.map(item=>[item.code,item.path]),[['UNEXPECTED_FIELD','/extra'],['MISSING_FIELD','/z'],
        ['ENUM_MISMATCH','/x'],['MIN_LENGTH','/x'],['MAX_ITEMS','/y'],['MAXIMUM','/y/0'],['TYPE_MISMATCH','/y/1']]);
    assert.throws(()=>validateValue({x:5},schema),error=>error.code==='SCHEMA_INVALID' && error.issues.length===2);
    const reversed=inspectValue({extra:true,x:'b',y:[99,'wrong',4]},schema);
    assert.deepEqual(result,reversed);
});
test('object enums ignore property insertion order and diagnostics are bounded',()=>{
    const schema={type:'object',additionalProperties:false,required:['a','b'],properties:{a:{type:'integer'},b:{type:'integer'}},enum:[{a:1,b:2}]};
    assert.equal(inspectValue({b:2,a:1},schema).valid,true);
    compatible({...schema,enum:[{b:2,a:1}]},schema);
    const result=compareJSON(Array(100).fill(0),Array(100).fill(1),3);
    assert.equal(result.issues.length,3); assert.equal(result.truncated,true);
    assert.equal(preview('x'.repeat(10000)).text.length,256);
});
test('source envelope errors identify fields and scoped repairs preserve good tasks',()=>{
    assert.throws(()=>applySources(spec,'{"sources":[{"id":"unknown","source":"x"}]}'),error=>error.issues.some(issue=>issue.path==='/sources/0/id'));
    assert.throws(()=>applySources(spec,'{"sources":[{"id":"normalizar","source":"x"}]}'),error=>error.issues.some(issue=>issue.code==='MISSING_TASK' && issue.expected==='clasificar'));
    assert.throws(()=>applySources(spec,'not json'),error=>error.code==='JSON_INVALID');
    const repaired=applySources(spec,JSON.stringify({sources:[{id:'clasificar',source:'module.exports=()=>({});'}]}),{taskIds:['clasificar'],requireAll:false});
    assert.deepEqual(repaired.tasks[0],spec.tasks[0]);
    assert.throws(()=>applySources(spec,JSON.stringify({sources:[{id:'normalizar',source:'x'}]}),{taskIds:['clasificar'],requireAll:false}));
});
test('duplicate task and flow differences group by responsible task',()=>{
    const issue={code:'VALUE_MISMATCH',path:'/categoria',expected:'urgente',actual:'normal',hint:'Fix the value.'};
    const report={criteria:{allCasesPassed:false},cases:[{scope:'task:clasificar',id:'urgente-explicita',passed:false,observed:{categoria:'normal'},diagnostic:{issues:[issue]}},
        {scope:'flow',id:'urgente-servicio-caido',passed:false,observed:{categoria:'normal'},diagnostic:{issues:[issue]}}]};
    const result=buildRepairFeedback(spec,policy,report);
    assert.equal(result.groups.length,1);assert.equal(result.groups[0].caseCount,2);
    assert.deepEqual(result.repairTaskIds,['clasificar']); assert(Buffer.byteLength(JSON.stringify(result))<32768);
});
test('repeated candidate stops before another verification or publication',async()=>{
    const temporary=await mkdtemp(join(tmpdir(),'diagnostic-stalled-'));let checks=0;
    const content=JSON.stringify({sources:spec.tasks.map(({id,source})=>({id,source}))});
    try {
        const result=await generateAndQualify({template:spec,policy,criteria,datasetText:'reserved',kind:'ilustrativo',outputDirectory:join(temporary,'run'),
            provider:{identity:{fixture:true},async generate(){return {content};}},qualify:async args=>{
                checks++;await mkdir(args.outputDirectory);await writeFile(join(args.outputDirectory,'functional.json'),JSON.stringify({criteria:{},cases:[{scope:'flow',id:'unknown',passed:false,error:null}]}));
                return {status:'REJECTED',stage:'functional',artifactId:null};}});
        assert.equal(result.status,'STALLED');assert.equal(checks,1);assert.equal(result.attempts.length,2);
        assert.equal(result.attempts[1].feedback.code,'UNCHANGED_CANDIDATE');
    } finally {await rm(temporary,{recursive:true,force:true});}
});
test('a process failure cannot satisfy an expected schema rejection', {skip:process.platform!=='linux'}, async()=>{
    const base=JSON.parse(await readFile(new URL('../examples/flow.json',import.meta.url)));
    const external=JSON.parse(await readFile(new URL('../examples/policy.json',import.meta.url)));
    const task=base.tasks[0];
    task.source+='\nconst original=module.exports; module.exports=input=>{if(input.texto==="trigger-runtime") throw new Error("intentional failure");return original(input);};';
    external.taskCases[task.id].push({id:'exact-error-kind',input:{texto:'trigger-runtime'},expectError:true,expectErrorCode:'SCHEMA_INVALID'});
    const result=await verify({spec:base,policy:external});
    const failure=result.cases.find(item=>item.id==='exact-error-kind');
    assert.equal(result.accepted,false);assert.equal(failure.passed,false);
    assert.equal(failure.errorCode,'TASK_PROCESS_FAILED');assert.equal(failure.diagnostic.code,'ERROR_CODE_MISMATCH');
});

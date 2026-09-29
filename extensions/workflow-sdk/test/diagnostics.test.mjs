import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJSON, preview } from '../src/diagnostics.mjs';
import { inspectValue, validateValue, compatible } from '../src/schema.mjs';
import { readFile } from 'node:fs/promises';
import { verify } from '../src/index.mjs';
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

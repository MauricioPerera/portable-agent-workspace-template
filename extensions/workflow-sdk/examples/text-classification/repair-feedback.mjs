import { canonical } from '../../src/definition.mjs';
import { preview } from '../../src/diagnostics.mjs';

function responsibleTask(spec, scope, path) {
    if (scope.startsWith('task:')) return scope.slice(5);
    const keys = path.split('/').slice(1).map(key => key.replace(/~1/g,'/').replace(/~0/g,'~'));
    const binding = spec.output[keys[0]];
    if (!binding?.$ref) return null;
    const [stepId,...fields] = binding.$ref.split('.');
    return {id:spec.steps.find(step => step.id === stepId)?.task ?? null,path:'/'+[...fields,...keys.slice(1)].join('/')};
}
export function buildRepairFeedback(spec, policy, report) {
    const failed = report.cases.filter(item => !item.passed);
    const ordered = [...failed].sort((a,b) => Number(a.scope==='flow')-Number(b.scope==='flow'));
    const groups = new Map(), taskIds = new Set(); let groupsTruncated = false;
    for (const item of ordered) {
        const diagnostic = item.diagnostic ?? {code:'DIAGNOSTIC_UNAVAILABLE',issues:[]};
        const issues = diagnostic.issues.length ? diagnostic.issues : [{code:diagnostic.code,path:'',hint:diagnostic.message ?? item.error ?? 'Inspect this failing development case.'}];
        for (const issue of issues) {
            const target = responsibleTask(spec,item.scope,issue.path);
            const taskId = typeof target === 'string' ? target : target?.id ?? null;
            if (taskId) taskIds.add(taskId);
            const pattern = {...issue,taskId,path:typeof target==='object' && target ? target.path : issue.path};
            const key = canonical({taskId,path:pattern.path,code:pattern.code,expected:pattern.expected ?? null,actual:pattern.actual ?? null});
            if (!groups.has(key)) {
                if (groups.size>=24) {groupsTruncated=true;continue;}
                groups.set(key,{...pattern,caseCount:0,cases:[]});
            }
            const group=groups.get(key); group.caseCount++;
            if(group.cases.length<16) group.cases.push({scope:item.scope,id:item.id});
        }
    }
    // Unknown flow failure must not arbitrarily blame one task.
    if (ordered.some(item => item.scope==='flow' && !(item.diagnostic?.issues?.length))) for(const task of spec.tasks) taskIds.add(task.id);
    const failures = ordered.slice(0,8).map(item => {
        const taskId = item.scope.startsWith('task:') ? item.scope.slice(5) : null;
        const fixture=(taskId ? policy.taskCases[taskId] : policy.flowCases)?.find(fixture=>fixture.id===item.id);
        return {scope:item.scope,id:item.id,error:item.error ?? null,input:preview(fixture?.input),
            expected:fixture?.expectError ? {expectError:true,code:fixture.expectErrorCode ?? 'any_error'} : preview(fixture?.expected),actual:item.observed ?? null,
            diagnostic:item.diagnostic ?? {code:'DIAGNOSTIC_UNAVAILABLE',issues:[],truncated:false}};
    });
    const feedback={stage:'functional',code:'FUNCTIONAL_REJECTED',failedCases:failed.length,totalCases:report.cases.length,
        criteria:report.criteria,repairTaskIds:[...taskIds].sort(),groups:[...groups.values()],groupsTruncated,
        failures,omittedCases:Math.max(0,ordered.length-failures.length),
        note:'JSON Pointer paths identify exact fields. Fix only the listed task implementations. Observations come from the original verification, without reexecution. Keep all external criteria unchanged.'};
    if(!feedback.repairTaskIds.length) feedback.repairTaskIds=spec.tasks.map(task=>task.id).sort();
    // Bound model-facing feedback, while the complete report remains on disk.
    while(Buffer.byteLength(canonical(feedback))>32768 && feedback.failures.length) {feedback.failures.pop();feedback.omittedCases++;}
    while(Buffer.byteLength(canonical(feedback))>32768 && feedback.groups.length) {feedback.groups.pop();feedback.groupsTruncated=true;}
    return feedback;
}

#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { verify, publish, executeArtifact, compileFlow, loadArtifact, validatePolicy } from './index.mjs';
import { canonical, validateFlow, sha } from './definition.mjs';
import { validateValue, ID } from './schema.mjs';
import { errorDiagnostic } from './diagnostics.mjs';
import { operationSchema, searchOperations } from './catalog.mjs';

async function json(path) {
    if ((await stat(path)).size > 1048576) throw new Error('JSON file exceeds 1 MiB');
    const data = await readFile(path);
    if (data.length > 1048576) throw new Error('JSON file exceeds 1 MiB');
    return JSON.parse(data);
}
function parse(command, args) {
    const contract = operationSchema(command).arguments;
    const options = Object.create(null);
    if (args[0] && !args[0].startsWith('--') && ['search', 'schema'].includes(command)) {
        options[command === 'search' ? 'query' : 'operation'] = args[0]; args = args.slice(1);
    }
    for (let i = 0; i < args.length; i++) {
        const token = args[i], key = token.slice(2);
        if (!token.startsWith('--') || !Object.hasOwn(contract.properties, key) || Object.hasOwn(options, key)) {
            const error = new Error('Unknown or repeated CLI argument: ' + token); error.code = 'CLI_INVALID_ARGUMENT'; throw error;
        }
        if (key === 'dry-run') options[key] = true;
        else {
            const value = args[++i];
            if (value === undefined || value.startsWith('--')) {
                const error = new Error('Missing value for --' + key); error.code = 'CLI_INVALID_ARGUMENT'; throw error;
            }
            options[key] = value;
        }
    }
    validateValue(options, contract, 'CLI arguments');
    return options;
}
function flowPlan(command, spec, options, policy) {
    return { schemaVersion: 1, operation: command, dryRun: true, executed: false,
        checks: { flowContract: true, policyContract: policy ? true : null, inputContract: options.input ? true : null },
        flowId: spec.id, specHash: sha(spec), policyHash: policy ? sha(policy) : null,
        executionPlatform: 'linux-x86_64-sandbox',
        steps: spec.steps.map(step => {
            const task = spec.tasks.find(item => item.id === step.task);
            return { id: step.id, task: step.task, taskHash: sha(task), bindings: step.with,
                permissions: task.permissions, limits: task.limits };
        }),
        outputSchema: spec.outputSchema, qualityVerified: false,
        plannedEffects: operationSchema(command).effects,
        destinations: Object.fromEntries(['registry', 'state', 'evidence'].filter(key => options[key]).map(key => [key, options[key]])) };
}
async function main() {
    const [command = 'search', ...args] = process.argv.slice(2);
    const options = parse(command, args);
    if (command === 'search') return searchOperations(options.query);
    if (command === 'schema') return operationSchema(options.operation);
    if (command === 'run') {
        if (!ID.test(options['run-id'])) throw new Error('Invalid run ID');
        const input = await json(options.input);
        const parameters = { registryDirectory: options.registry, artifactId: options.artifact,
            input, stateDirectory: options.state, runId: options['run-id'], resume: options.resume === 'true' };
        if (options['dry-run']) {
            const artifact = await loadArtifact(parameters);
            validateValue(input, artifact.spec.input, 'flow input');
            return { ...flowPlan(command, artifact.spec, options, artifact.policy), artifactId: artifact.artifactId,
                artifactVerified: true, qualityVerified: true, runId: parameters.runId, resume: parameters.resume,
                resumeCompatibilityChecked: false, runIdAvailabilityChecked: false };
        }
        return executeArtifact(parameters);
    }
    const spec = await json(options.spec);
    validateFlow(spec);
    const policy = options.policy ? await json(options.policy) : undefined;
    if (policy) validatePolicy(spec, policy);
    if (options.input) validateValue(await json(options.input), spec.input, 'flow input');
    if (options['dry-run']) return flowPlan(command, spec, options, policy);
    if (command === 'validate') return { schemaVersion: 1, valid: true, executed: false, flowId: spec.id,
        specHash: sha(spec), policyChecked: !!policy, inputChecked: !!options.input, qualityVerified: false };
    if (command === 'compile') return compileFlow(spec);
    const data = { spec, policy, evidenceDirectory: options.evidence };
    if (command === 'verify') {
        const report = await verify(data); if (!report.accepted) process.exitCode = 1; return report;
    }
    const result = await publish({ ...data, registryDirectory: options.registry });
    return { artifactId: result.artifactId, directory: result.directory, accepted: result.report.accepted };
}
main().then(result => console.log(canonical(result))).catch(error => {
    console.error(canonical({ schemaVersion: 1, ok: false, error: errorDiagnostic(error) })); process.exitCode = 1;
});

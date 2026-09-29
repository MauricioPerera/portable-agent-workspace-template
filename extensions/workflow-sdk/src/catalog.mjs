// Shared contracts for discovery and argument parsing. No cloud dependency.
const text = { type: 'string', minLength: 1, maxLength: 4096 };
const op = (name, description, terms, properties, required, effects, linux, dryRun) => ({
    name, description, terms, arguments: { type: 'object', properties, required, additionalProperties: false },
    effects, platform: linux ? 'linux-x86_64-sandbox' : 'any-node-22+', dryRun,
});
const entries = [
    op('search', 'Discover local operations; descubrir operaciones; descobrir operações.',
        'buscar listar discover find catalogue catalogo', { query: text }, [], [], false, false),
    op('schema', 'Inspect an operation argument contract and its effects.',
        'esquema contrato contract permisos permissions help ayuda ajuda', { operation: text }, ['operation'], [], false, false),
    op('validate', 'Validate a flow, optional policy and input without executing task code.',
        'validar validacao validação determinista static referencias contratos entrada input',
        { spec: text, policy: text, input: text }, ['spec'], ['read-files'], false, true),
    op('compile', 'Compile a validated flow into an engine chain without executing task code.',
        'compilar compilação cadena workflow flujo fluxo', { spec: text }, ['spec'], ['read-files'], false, true),
    op('verify', 'Execute task and flow fixtures against an external policy and latency budget.',
        'verificar probar testar test quality calidad qualidade fixtures evaluacion',
        { spec: text, policy: text, evidence: text }, ['spec', 'policy'],
        ['read-files', 'sandbox-execution', 'temporary-state', 'optional-evidence-write'], true, true),
    op('publish', 'Verify fixtures then publish an approved immutable artifact to a local registry.',
        'publicar registrar registry registro artefacto artifact approved aprobar',
        { spec: text, policy: text, registry: text, evidence: text }, ['spec', 'policy', 'registry'],
        ['read-files', 'sandbox-execution', 'temporary-state', 'registry-write', 'optional-evidence-write'], true, true),
    op('run', 'Execute or resume a registered approved artifact with isolated tasks.',
        'ejecutar executar execution flujo workflow fluxo recuperar resume reanudar',
        { registry: text, artifact: text, input: text, state: text, 'run-id': text, resume: { type: 'string', enum: ['true'] } },
        ['registry', 'artifact', 'input', 'state', 'run-id'], ['read-files', 'sandbox-execution', 'state-write'], true, true),
];
export function operationSchema(name) {
    const entry = entries.find(item => item.name === name);
    if (!entry) { const error = new Error('Unknown operation: ' + name); error.code = 'CLI_UNKNOWN_OPERATION'; throw error; }
    const result = structuredClone(entry);
    if (entry.dryRun) result.arguments.properties['dry-run'] = { type: 'boolean' };
    return { schemaVersion: 1, ...result, command: 'workspace-flow ' + name,
        output: 'JSON on stdout; structured errors on stderr; exit 0 success, 1 rejection/error',
        dryRunEffects: entry.dryRun ? ['read-files'] : [],
        dryRunMeaning: entry.dryRun ? 'Plan only: no task code, fixture tests or writes. Run checks artifact integrity and requires Linux runtime identity.' : null };
}
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchOperations(query = '') {
    const terms = [...new Set(normalize(query).split(/\s+/).filter(Boolean))];
    return { schemaVersion: 1, query, source: 'local-operation-catalog', operations: entries.map(entry => {
        const haystack = normalize([entry.name, entry.description, entry.terms].join(' '));
        const matchedTerms = terms.filter(term => haystack.includes(term));
        return { name: entry.name, description: entry.description, effects: entry.effects,
            platform: entry.platform, dryRun: entry.dryRun, matchedTerms,
            score: matchedTerms.length + (terms.length && normalize(query).trim() === entry.name ? 4 : 0) };
    }).filter(entry => !terms.length || entry.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)) };
}

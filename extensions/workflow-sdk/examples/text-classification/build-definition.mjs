import { readFile, writeFile } from 'node:fs/promises';
import { defineTask, defineFlow, ref } from '../../src/index.mjs';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const texto = { type: 'string', maxLength: 4096 };
const normalizado = { type: 'string', maxLength: 8192 };
const identificador = { type: 'string', minLength: 1, maxLength: 64 };
const resultado = {
    categoria: { type: 'string', enum: ['urgente', 'normal', 'revisión'] },
    requiere_revision: { type: 'boolean' },
    reglas_aplicadas: { type: 'array', maxItems: 9, items: { type: 'string', enum: [
        'urgente.explicita', 'urgente.inmediata', 'urgente.bloqueo', 'urgente.caida',
        'normal.sin_urgencia', 'normal.sin_prisa', 'revision.incertidumbre', 'revision.conflicto', 'revision.vacio'
    ] } }
};
const configuration = { language: 'javascript', permissions: { network: false, filesystem: false },
    limits: { timeoutMs: 3000, memoryMb: 128, outputBytes: 16384 } };
// Read candidate code as data. Neither task is imported or evaluated by the host.
const normalizar = defineTask({ ...configuration, id: 'normalizar', input: object({ texto }),
    output: object({ texto_normalizado: normalizado }), source: await readFile(new URL('./tasks/normalizar.cjs', import.meta.url), 'utf8') });
const clasificar = defineTask({ ...configuration, id: 'clasificar', input: object({ texto_normalizado: normalizado }),
    output: object(resultado), source: await readFile(new URL('./tasks/clasificar.cjs', import.meta.url), 'utf8') });
const flow = defineFlow({ schemaVersion: 1, id: 'clasificar-textos',
    objective: 'Clasificar textos por prioridad en urgente, normal y revisión; conservar el identificador; respetar negaciones explícitas de urgencia y marcar textos vacíos, incertidumbre o señales contradictorias para revisión; exponer las reglas aplicadas.',
    input: object({ id: identificador, texto }), tasks: [normalizar, clasificar],
    steps: [ { id: 'limpiar', task: 'normalizar', with: { texto: ref('input.texto') } },
        { id: 'categorizar', task: 'clasificar', with: { texto_normalizado: ref('limpiar.texto_normalizado') } } ],
    output: { id: ref('input.id'), texto_normalizado: ref('limpiar.texto_normalizado'), categoria: ref('categorizar.categoria'),
        requiere_revision: ref('categorizar.requiere_revision'), reglas_aplicadas: ref('categorizar.reglas_aplicadas') },
    outputSchema: object({ id: identificador, texto_normalizado: normalizado, ...resultado }) });
await writeFile(new URL('./flow.json', import.meta.url), JSON.stringify(flow, null, 2) + '\n');
console.log('Wrote classification flow definition');

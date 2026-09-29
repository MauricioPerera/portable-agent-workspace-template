import { writeFile } from 'node:fs/promises';
import { defineTask, defineFlow, ref } from '../src/index.mjs';
const text = { type: 'string', maxLength: 4096 };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const limits = { timeoutMs: 3000, memoryMb: 128, outputBytes: 16384 };
const permissions = { network: false, filesystem: false };
const normalizar = defineTask({ id: 'normalizar', language: 'javascript',
    input: object({ texto: text }), output: object({ texto: text }), permissions, limits,
    source: 'module.exports = async ({ texto }) => ({ texto: texto.trim().toLowerCase() });' });
const contar = defineTask({ id: 'contar', language: 'javascript',
    input: object({ texto: text }), output: object({ palabras: { type: 'integer', minimum: 0 } }), permissions, limits,
    source: 'module.exports = ({ texto }) => ({ palabras: texto.split(/\\s+/u).filter(Boolean).length });' });
const spec = defineFlow({ schemaVersion: 1, id: 'preparar-texto',
    objective: 'Normalizar espacios exteriores y mayúsculas; contar palabras separadas por espacios, conservando texto y caracteres Unicode.',
    input: object({ texto: text }), tasks: [normalizar, contar],
    steps: [ { id: 'limpiar', task: 'normalizar', with: { texto: ref('input.texto') } },
        { id: 'medir', task: 'contar', with: { texto: ref('limpiar.texto') } } ],
    output: { texto: ref('limpiar.texto'), palabras: ref('medir.palabras') },
    outputSchema: object({ texto: text, palabras: { type: 'integer', minimum: 0 } }) });
await writeFile(new URL('./flow.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log('Wrote examples/flow.json');

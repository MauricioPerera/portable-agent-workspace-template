---
type: 'Technical Guide'
title: 'Portable workflow SDK'
---

# Portable workflow SDK — primer hito

SDK funcional para definir cadenas de tareas JavaScript propias sin usar un catálogo de nodos. Los contratos y flujos son datos JSON; el código de cada tarea viaja como un string y solo se ejecuta en el entorno aislado de Linux. El compilador utiliza un adaptador interno de pieces para conectar esas tareas al motor extraído de Activepieces.

## Alcance probado

- Definición, contratos, referencias a entradas y resultados anteriores, compilación y CLI.
- Tareas CommonJS que exportan una función, síncrona o async, con entrada y salida JSON.
- Verificación contra fixtures y presupuestos externos al paquete generado.
- Aislamiento Linux mediante Bubblewrap y límites de systemd, sin fallback a ejecución directa.
- Publicación local condicionada a verificación, fingerprints, ejecución y recuperación.

Las cadenas son lineales. No se implementaron ramas, bucles, Python, dependencias aportadas por tareas, red, archivos del workspace, credenciales ni efectos externos. El SDK puede consumir una definición producida por cualquier IA; este hito no incluye una integración con un proveedor de modelos ni un ciclo autónomo de reparación.

El ejemplo de clasificación incorpora una [puerta de aprobación conjunta](examples/text-classification/QUALIFICATION.md): casos funcionales y evaluación etiquetada antes de publicar, con un lanzador que exige la evidencia y distingue aprobaciones experimentales. Es una capa de aplicación para ese perfil; la API base del SDK mantiene sus contratos de aceptación funcional.

## Instalación

Node 22+, Linux x86_64 con `/usr/bin/bwrap`, `/usr/bin/systemd-run`, `/usr/bin/systemctl` y `/usr/bin/flock`; runtime y bibliotecas en las rutas usadas por `src/sandbox.mjs`. El usuario del SDK necesita permisos para crear y detener las unidades temporales del sistema. La prueba se hizo con el acceso root existente en el VPS; no se creó un servicio permanente.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
node src/cli.mjs compile --spec examples/flow.json
node src/cli.mjs verify --spec examples/flow.json \
  --policy examples/policy.json --evidence evidence
node src/cli.mjs publish --spec examples/flow.json \
  --policy examples/policy.json --registry .registry --evidence evidence
```

Copiar el `artifactId` devuelto por `publish` para ejecutar:

```sh
node src/cli.mjs run --registry .registry --artifact ID_DEVUELTO \
  --input examples/input.json --state .state --run-id ejemplo-001

node src/cli.mjs run --registry .registry --artifact ID_DEVUELTO \
  --input examples/input.json --state .state --run-id ejemplo-001 --resume true
```

Un run nuevo requiere un identificador nuevo. Un resultado ya completado se recupera sin volver a invocar las tareas. Los cambios en entrada, definición, paquete registrado o runtime invalidan la recuperación. Los estados terminales fallidos requieren un run nuevo.

En Windows se pueden construir y compilar definiciones; la verificación y ejecución aisladas requieren Linux. Las pruebas operativas se omiten en Windows y nunca se sustituyen por un ejecutor sin aislamiento.

## CLI para agentes y automatizaciones

La CLI incorpora la filosofía de descubrimiento, contratos consultables y planes previos de `cf`, usando el SDK local. No depende de Cloudflare ni requiere una cuenta.

```sh
node src/cli.mjs search "ejecutar flujo"
node src/cli.mjs schema run
node src/cli.mjs validate --spec examples/flow.json \
  --policy examples/policy.json --input examples/input.json
node src/cli.mjs publish --spec examples/flow.json \
  --policy examples/policy.json --registry .registry --evidence evidence --dry-run
```

El binario declarado en el paquete es `workspace-flow`; `node src/cli.mjs` funciona desde esta carpeta sin instalar el binario globalmente. Sin argumentos lista las operaciones.

| Operación | Resultado | Ejecuta código de tareas |
| --- | --- | --- |
| `search [consulta]` | Catálogo local ordenado, coincidencias, efectos y plataforma | No |
| `schema OPERACION` | Contrato JSON de argumentos, efectos y soporte de plan | No |
| `validate --spec ...` | Contratos, referencias, permisos y límites; política y entrada opcionales | No |
| `compile --spec ...` | Cadena compatible con el motor | No |
| `verify --spec ... --policy ...` | Casos funcionales y presupuesto de latencia externos | Sí, Linux |
| `publish --spec ... --policy ... --registry ...` | Artefacto registrado tras superar `verify` | Sí, Linux |
| `run --registry ... --artifact ... --input ... --state ... --run-id ...` | Resultado de un artefacto aprobado, con recuperación opcional | Sí, Linux |

`search` acepta también `--query`; `schema`, `--operation`. La búsqueda normaliza tildes, reconoce vocabulario español, inglés y portugués, y prioriza nombres exactos. Es una búsqueda léxica local: expone las coincidencias y puede devolver varias operaciones; consultar su esquema antes de elegir una. Una consulta sin coincidencias devuelve una lista vacía.

`schema` y el analizador de argumentos comparten el catálogo de `src/catalog.mjs`. Los argumentos desconocidos, repetidos, ausentes o inválidos se rechazan. La CLI emite JSON en stdout; los errores emiten JSON en stderr con `error.code`, `message` y diagnósticos disponibles. Exit 0 indica éxito; exit 1 indica error o rechazo de calidad. Un `verify` que rechaza el candidato conserva el informe en stdout.

### Plan previo

`validate`, `compile`, `verify`, `publish` y `run` admiten el flag `--dry-run` sin valor. El plan incluye hashes, orden de pasos, referencias, permisos, límites, efectos previstos y destinos. Lee y valida los archivos necesarios; no ejecuta fuentes de tareas, no corre fixtures ni crea directorios de estado, registro o evidencias.

El plan de `verify` o `publish` valida también la política externa y sus presupuestos. Su `qualityVerified: false` distingue contratos válidos de resultados funcionales correctos. Tampoco analiza la sintaxis JavaScript: los errores de código se detectan al verificar en el sandbox.

```sh
node src/cli.mjs run --registry .registry --artifact ID_DEVUELTO \
  --input examples/input.json --state .state --run-id ejemplo-002 --dry-run
```

El plan de `run` requiere un registro existente y Linux para comprobar la identidad del runtime. Verifica la integridad y evidencia previa del artefacto y valida la entrada. `qualityVerified: true` se refiere a esa evidencia previa; no prueba la respuesta a esta nueva entrada. No reserva el identificador ni comprueba la compatibilidad de un checkpoint para `--resume true`; el plan lo declara explícitamente. Esas comprobaciones se hacen durante la ejecución con el bloqueo de estado.

La validación estática y los planes sobre `--spec` funcionan en Windows. Verificar y ejecutar tareas siguen requiriendo el aislamiento Linux. `verify` significa probar el flujo contra fixtures; no audita una ejecución histórica ni demuestra calidad fuera de los casos y límites de la política.

### Compatibilidad de artefactos

Se conservan los comandos y resultados anteriores de `compile`, `verify`, `publish` y `run`. Los errores de la CLI ahora son JSON. La lectura de un registro ausente falla sin crearlo. Esta revisión modifica archivos incluidos en la identidad del runtime: los artefactos de revisiones previas deben verificarse y publicarse de nuevo antes de ejecutarse.

## API de autoría

```js
import { defineTask, defineFlow, ref } from 'portable-workflow-sdk';

const contratoTexto = {
  type: 'object',
  properties: { texto: { type: 'string', maxLength: 4096 } },
  required: ['texto'],
  additionalProperties: false
};

const normalizar = defineTask({
  id: 'normalizar',
  language: 'javascript',
  input: contratoTexto,
  output: contratoTexto,
  permissions: { network: false, filesystem: false },
  limits: { timeoutMs: 3000, memoryMb: 128, outputBytes: 16384 },
  source: 'module.exports = ({ texto }) => ({ texto: texto.trim().toLowerCase() });'
});

const flujo = defineFlow({
  schemaVersion: 1,
  id: 'normalizar-texto',
  objective: 'Eliminar espacios exteriores y convertir texto a minúsculas.',
  input: contratoTexto,
  tasks: [normalizar],
  steps: [{ id: 'limpiar', task: 'normalizar', with: { texto: ref('input.texto') } }],
  output: ref('limpiar'),
  outputSchema: contratoTexto
});
```

`examples/build-definition.mjs` demuestra la autoría mediante código **confiable** y genera `examples/flow.json`. Para recibir material de una IA, usar JSON con la CLI; no importar ni ejecutar en el host un programa de autoría generado sin revisión.

### Esquemas y referencias

Se soporta un subconjunto estricto de JSON Schema: `type`, `properties`, `required`, `additionalProperties: false`, `items`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength` y `maxItems`. Tipos: object, array, string, number, integer, boolean y null. Las palabras clave desconocidas se rechazan; no se ignoran como si estuvieran implementadas.

`ref('input.texto')` lee una entrada; `ref('limpiar.texto')` lee un resultado anterior. Se rechazan referencias futuras, campos inexistentes/opcionales y contratos incompatibles. Además se valida el valor concreto antes y después de cada tarea. Las entradas no se interpolan como código o expresiones de Activepieces.

## Criterios externos y calidad

`policy.json` es una entrada **confiable del evaluador**, separada del paquete generado. La IA puede proponer criterios, pero el actor que publica debe revisar y mantener esa política fuera de su control. El aislamiento impide que una tarea la lea o modifique; no impide que el operador del SDK suministre una política permisiva.

Cada tarea y el flujo completo necesitan al menos dos fixtures positivos independientes, con resultado esperado explícito. También se admiten fixtures negativos con `expectError: true`. El verificador comprueba:

1. Coincidencia con el objetivo externo, contratos y presupuestos.
2. Ejecución de cada tarea y del flujo real, con resultados JSON iguales a los esperados.
3. Rechazo de fixtures negativos y cumplimiento del máximo externo de mediana de latencia.
4. Resultado correcto de **todos** los casos, sin puntuación subjetiva que oculte fallos.

`publish()` siempre invoca el verificador; no recibe un booleano de aprobación aportado por el candidato. Un fallo impide registrar el paquete. Pasar los casos acredita esos casos y criterios, no corrección universal; tareas de clasificación o salidas no deterministas necesitarán evaluadores y datasets adicionales.

## Ejecución y aislamiento

Cada invocación crea una unidad temporal y un proceso Bubblewrap con namespaces separados de red y PID. Se exponen únicamente Node, bibliotecas de ejecución, el worker de protocolo, `/proc` del namespace y dispositivos mínimos. No se montan el workspace, registro, criterios, home o estado del host. El entorno se limpia y la tarea corre con UID/GID 65534 y sin capacidades Linux.

Se utiliza adicionalmente el modelo de permisos de Node para restringir archivos, subprocessos, workers y addons. El worker de protocolo está permitido en lectura; la tarea no recibe permisos de lectura/escritura del workspace. El modelo de permisos de Node por sí solo no es una frontera frente a código malicioso, según la [documentación de Node 22](https://nodejs.org/download/release/v22.17.0/docs/api/permissions.html); la frontera implementada depende también de los namespaces, mounts y cgroups. Bubblewrap requiere que el host defina su política concreta, como explica su [documentación oficial](https://github.com/containers/bubblewrap).

systemd aplica memoria total y swap deshabilitado, CPUQuota=100%, TasksMax=32 y KillMode=control-group. El supervisor aplica timeout y máximo combinado de stdout/stderr; stdout se reserva para el protocolo JSON. `console.log()` dentro de una tarea rompe ese protocolo; los mensajes de diagnóstico pueden usar stderr dentro del presupuesto.

El timeout incluye arranque del entorno aislado. Si muere el proceso del SDK, las unidades tienen un límite `RuntimeMaxSec` de `ceil(timeoutMs/1000)+1` segundos que limita su permanencia; no se promete terminación instantánea del worker por la muerte del cliente. No se incluyó un filtro seccomp propio ni se acredita resistencia a vulnerabilidades del kernel/Node/Bubblewrap. El perfil actual debe revisarse antes de exponerlo como servicio público multiusuario.

## Versiones, evidencia y recuperación

El registro usa un identificador derivado de hashes de definición, política e identidad del runtime. La identidad incluye fuentes del SDK, worker, bundle del motor, manifiesto/lock npm, binario Node y versiones de las herramientas de aislamiento. No incluye hashes de todos los archivos de dependencias transitivas ni del sistema operativo.

Cada paquete contiene `spec.json`, `policy.json`, `verification.json` y un manifiesto con hashes. El loader comprueba integridad, correspondencia con todos los fixtures, criterio de latencia y coincidencia del runtime actual. Si cambian SDK/runtime, hay que verificar y publicar otra versión. Los hashes son controles de integridad y procedencia local, **no firmas** contra un actor que pueda reescribir todo el registro y el código del host.

Los checkpoints se guardan en un único envelope atómico con hash de snapshot y solicitud. `flock` mantiene un solo escritor por directorio de estado. El motor mantiene una ejecución activa por proceso: usar procesos distintos para ejecutar workspaces en paralelo.

La recuperación se probó después de matar el proceso entre tareas: restauró el resultado de la primera e invocó solo la segunda. No se acredita recuperación ante pérdida de alimentación ni ejecución exactamente una vez. Este perfil ejecuta transformaciones sin efectos externos.

## Generación de tareas por IA

El verificador registra diagnósticos de la ejecución original con códigos estables, rutas JSON Pointer y diferencias exactas por campo. `inspectValue()` reúne hasta 64 problemas de esquema; `compareJSON()` distingue campos o elementos faltantes, sobrantes, orden de arrays y diferencias Unicode. Los valores mostrados se acotan, y el reporte indica truncamiento. El resultado de aprobación sigue comparando JSON completo y los criterios externos.

Los fixtures negativos pueden declarar `expectErrorCode` junto a `expectError: true` para exigir una clase de error. Los ejemplos usan `SCHEMA_INVALID`; fallos de proceso, protocolo o presupuesto se distinguen. Sin ese campo, se conserva el comportamiento de cualquier error.

El ejemplo de clasificación incluye un [generador con Ollama local](examples/text-classification/GENERATION.md). La IA propone código para tareas con contrato fijo; el circuito limita las correcciones a tres intentos, ejecuta las pruebas en Linux y aplica la calificación antes de publicar. No permite que el candidato cambie pruebas, permisos o criterios. Los datos ilustrativos siguen produciendo publicaciones experimentales.

## Procedencia del motor

El paquete local `packages/activepieces-engine-standalone-0.1.0.tgz` conserva los avisos y la licencia MIT de las fuentes extraídas de Activepieces, commit `2d5a47708c87e3ce17116d2d4b34d4d1208e8cd2`. Sus dependencias mantienen sus propias licencias bajo `node_modules/`. No se modificaron la plantilla distribuidora ni n8n.
